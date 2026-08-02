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
import type { OrcamentoValidacaoRepository } from '../../domain/repositories/orcamento-validacao.repository.js';
import { CNPJ } from '../../domain/value-objects/cnpj.vo.js';
import { InconsistenciaDetectada } from '../../domain/value-objects/inconsistencia-detectada.vo.js';

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
 * regra de preço não se aplica — invocar `AgenteCategorizadorItemGateway`
 * (Bedrock) para itens sem categoria é US3/T042, fora do escopo desta task.
 */
export class ValidarOrcamento {
  constructor(
    private readonly acl: OrcamentoExtraidoEventACL,
    private readonly repositorio: OrcamentoValidacaoRepository,
    private readonly fornecedorCadastrado: FornecedorCadastradoGateway,
    private readonly parametroFaixaPreco: ParametroFaixaPrecoGateway,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(payloadBruto: unknown): Promise<void> {
    const { orcamentoId, dadosExtraidos } = this.acl.traduzir(payloadBruto);

    const existente = await this.repositorio.buscarPorOrcamentoId(orcamentoId);
    if (existente && existente.status !== 'PENDENTE') {
      // Entrega duplicada da fila SQS (at-least-once): já avaliado — nunca
      // reavalia nem republica (mesma disciplina de ADR-001).
      return;
    }

    const validacao = existente ?? OrcamentoValidacao.criar(orcamentoId, dadosExtraidos);

    const inconsistenciasCnpj = validarCnpjValido(dadosExtraidos);
    const cnpjValido = inconsistenciasCnpj.length === 0;
    // CNPJ já reprovado por formato/dígito verificador (CNPJ_INVALIDO cobre
    // a exceção): checar cadastro externo seria redundante e o valor não
    // forma um CNPJ construível (`CNPJ.de` lançaria de novo).
    const cadastrado = cnpjValido
      ? await this.fornecedorCadastrado.estaCadastrado(CNPJ.de(dadosExtraidos.cnpjFornecedor))
      : true;

    const faixasPreco = await this.parametroFaixaPreco.listarTodas();

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
    await this.repositorio.salvar(validacao);

    const evento =
      validacao.status === 'VALIDADO'
        ? new OrcamentoValidado(validacao.orcamentoId.toString())
        : new OrcamentoInconsistenciaDetectada(
            validacao.orcamentoId.toString(),
            validacao.inconsistencias.map((inconsistencia) => inconsistencia.paraPayload()),
          );
    await this.eventPublisher.publicar(evento);
  }
}
