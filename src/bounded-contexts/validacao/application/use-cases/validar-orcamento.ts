import type { AgenteCategorizadorItemGateway } from '../../domain/gateways/agente-categorizador-item.gateway.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type { FornecedorCadastradoGateway } from '../../domain/gateways/fornecedor-cadastrado.gateway.js';
import type { OrcamentoExtraidoEventACL } from '../../domain/gateways/orcamento-extraido-event.acl.js';
import type { ParametroFaixaPrecoGateway } from '../../domain/gateways/parametro-faixa-preco.gateway.js';
import { OrcamentoInconsistenciaDetectada } from '../../domain/events/orcamento-inconsistencia-detectada.event.js';
import { OrcamentoValidado } from '../../domain/events/orcamento-validado.event.js';
import { OrcamentoValidacao } from '../../domain/orcamento-validacao.aggregate.js';
import {
  validarCamposObrigatorios,
  validarCnpjValido,
  validarPrazoCoerente,
  validarPrecoDentroDaFaixa,
} from '../../domain/regras-consistencia.js';
import type { CriarOrcamentoValidacaoRepositorio } from '../../domain/repositories/orcamento-validacao.repository.js';
import { CNPJ } from '../../domain/value-objects/cnpj.vo.js';
import { DadosExtraidosParaValidacao } from '../../domain/value-objects/dados-extraidos-para-validacao.vo.js';
import type { FaixaPreco } from '../../domain/value-objects/faixa-preco.vo.js';
import { InconsistenciaDetectada } from '../../domain/value-objects/inconsistencia-detectada.vo.js';
import { ItemParaValidacao } from '../../domain/value-objects/item-para-validacao.vo.js';

/**
 * Consumidor dos eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * via SQS `validador-queue` (Interface, T025). Traduz o payload bruto via
 * `OrcamentoExtraidoEventACL`, aplica as 4 regras determinísticas de
 * consistência (T010) mais a checagem de CNPJ contra o cadastro de
 * fornecedores (`FornecedorCadastradoGateway`, T022), registra o resultado
 * no agregado `OrcamentoValidacao` (T009), persiste e publica
 * `OrcamentoValidado` ou `OrcamentoInconsistenciaDetectada` — nunca decide
 * o evento fora da regra do agregado (plan.md).
 *
 * Caminho feliz de US1 (T024): item já vem com `categoria` conhecida ou a
 * regra de preço não se aplica.
 *
 * US3/T042: item sem `categoria` conhecida (e com `descricao` — sem texto
 * não há o que categorizar) é categorizado via `AgenteCategorizadorItemGateway`
 * (Bedrock) antes da regra de preço, restrito ao catálogo de categorias já
 * configurado (`ParametroFaixaPrecoGateway`). Item que já vem categorizado
 * nunca é enviado ao agente — chamada de IA tem custo por invocação
 * (plan.md, T042). Sem faixas configuradas não há catálogo para categorizar
 * contra, então o agente nunca é chamado (nenhuma faixa poderia comparar o
 * resultado de qualquer forma). Falha do agente (erro/timeout do Bedrock)
 * propaga e nunca é engolida aqui: a mensagem SQS volta para a fila até
 * `maxReceiveCount`/DLQ, mesma disciplina de falha item-a-item já usada por
 * `validador-queue.handler.ts` para o Princípio IV (exceção nunca
 * silenciosa) — nunca marca "validado" um item cuja categoria não pôde ser
 * confirmada.
 *
 * Caminho de falha de US2 (T034): 1+ regra falhando publica
 * `OrcamentoInconsistenciaDetectada` em vez de `OrcamentoValidado` — decisão
 * inteiramente delegada ao status resultante de
 * `OrcamentoValidacao.avaliarRegrasDeConsistencia` (nunca reimplementada
 * aqui), coberto por `validar-orcamento.test.ts`.
 */
export class ValidarOrcamento {
  constructor(
    private readonly acl: OrcamentoExtraidoEventACL,
    private readonly criarRepositorio: CriarOrcamentoValidacaoRepositorio,
    private readonly fornecedorCadastrado: FornecedorCadastradoGateway,
    private readonly parametroFaixaPreco: ParametroFaixaPrecoGateway,
    private readonly eventPublisher: EventPublisher,
    private readonly agenteCategorizador: AgenteCategorizadorItemGateway,
  ) {}

  async executar(payloadBruto: unknown): Promise<void> {
    const {
      orcamentoId,
      dadosExtraidos: dadosTraduzidos,
      tenantId,
    } = this.acl.traduzir(payloadBruto);
    // (issue #656) Repositório construído por chamada a partir do `tenantId`
    // já validado pela ACL — nunca reaproveitado como campo fixo entre
    // chamadas (mesmo padrão de `CriarExtracaoOrcamentoRepositorio`).
    const repositorio = this.criarRepositorio(tenantId);

    const existente = await repositorio.buscarPorOrcamentoId(orcamentoId);
    if (existente && existente.status !== 'PENDENTE') {
      // Entrega duplicada da fila SQS (at-least-once): já avaliado — nunca
      // reavalia nem republica (mesma disciplina de ADR-001).
      return;
    }

    const faixasPreco = await this.parametroFaixaPreco.listarTodas();
    const dadosExtraidos = await this.categorizarItensSemCategoria(dadosTraduzidos, faixasPreco);

    const validacao = existente ?? OrcamentoValidacao.criar(orcamentoId, dadosExtraidos, tenantId);

    const inconsistenciasCnpj = validarCnpjValido(dadosExtraidos);
    const cnpjValido = inconsistenciasCnpj.length === 0;
    // CNPJ já reprovado por formato/dígito verificador (CNPJ_INVALIDO cobre
    // a exceção): checar cadastro externo seria redundante e o valor não
    // forma um CNPJ construível (`CNPJ.de` lançaria de novo).
    const cadastrado = cnpjValido
      ? await this.fornecedorCadastrado.estaCadastrado(CNPJ.de(dadosExtraidos.cnpjFornecedor))
      : true;

    const inconsistencias: InconsistenciaDetectada[] = [
      ...inconsistenciasCnpj,
      ...validarCamposObrigatorios(dadosExtraidos),
      ...validarPrecoDentroDaFaixa(dadosExtraidos, faixasPreco),
      ...validarPrazoCoerente(dadosExtraidos),
      ...(cadastrado
        ? []
        : [
            InconsistenciaDetectada.de(
              'CNPJ_DIVERGENTE_CADASTRO',
              'CNPJ do fornecedor não corresponde a nenhum cadastro conhecido',
            ),
          ]),
    ];

    validacao.avaliarRegrasDeConsistencia(inconsistencias);
    await repositorio.salvar(validacao);

    // (issue #656 — aperto de tipo) O evento carrega o `tenantId` já
    // persistido no agregado (fonte da verdade, imutável desde a criação) —
    // sempre concreto desde `OrcamentoValidacao.tenantId` deixar de ser
    // opcional (guard `OrcamentoValidacaoSemTenantIdError` removido: tornou-se
    // inalcançável).
    const tenantIdParaEvento = validacao.tenantId.toString();

    const evento =
      validacao.status === 'VALIDADO'
        ? new OrcamentoValidado(
            validacao.orcamentoId.toString(),
            dadosExtraidos.itens.map((item) => item.paraPayload()),
            dadosExtraidos.condicoesComerciais,
            tenantIdParaEvento,
          )
        : new OrcamentoInconsistenciaDetectada(
            validacao.orcamentoId.toString(),
            validacao.inconsistencias.map((inconsistencia) => inconsistencia.paraPayload()),
            tenantIdParaEvento,
          );
    await this.eventPublisher.publicar(evento);
  }

  /**
   * T042 — categoriza via `AgenteCategorizadorItemGateway` apenas os itens
   * sem `categoria` conhecida e com `descricao` (sem texto não há o que
   * categorizar; a regra "campos obrigatórios preenchidos" já reprova esse
   * caso). Sem faixa de preço configurada não existe catálogo contra o qual
   * categorizar — o agente nunca é chamado nesse caso (nenhuma faixa
   * poderia comparar o resultado de qualquer forma). Retorna os mesmos
   * `dados` sem cópia quando não há nada a categorizar.
   */
  private async categorizarItensSemCategoria(
    dados: DadosExtraidosParaValidacao,
    faixasPreco: readonly FaixaPreco[],
  ): Promise<DadosExtraidosParaValidacao> {
    const catalogoCategorias = faixasPreco.map((faixa) => faixa.categoria.paraPayload());
    const haItemParaCategorizar = dados.itens.some(
      (item) => !item.categoria && item.descricao !== undefined,
    );
    if (catalogoCategorias.length === 0 || !haItemParaCategorizar) {
      return dados;
    }

    const itens = await Promise.all(
      dados.itens.map(async (item) => {
        if (item.categoria || item.descricao === undefined) {
          return item;
        }
        const categoria = await this.agenteCategorizador.categorizar({
          descricaoItem: item.descricao,
          catalogoCategorias,
        });
        return ItemParaValidacao.de({
          descricao: item.descricao,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario,
          extraido: item.extraido,
          categoria,
        });
      }),
    );

    return DadosExtraidosParaValidacao.de({
      cnpjFornecedor: dados.cnpjFornecedor,
      itens,
      condicoesComerciais: dados.condicoesComerciais,
      dataEmissaoProposta: dados.dataEmissaoProposta,
      periodoValidade: dados.periodoValidade,
    });
  }
}
