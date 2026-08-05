import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type {
  DecisaoHumanaValidacao,
  OrcamentoValidacao,
} from '../../domain/orcamento-validacao.aggregate.js';
import { OrcamentoValidado } from '../../domain/events/orcamento-validado.event.js';
import { OrcamentoValidadoComRessalva } from '../../domain/events/orcamento-validado-com-ressalva.event.js';
import {
  validarCamposObrigatorios,
  validarCnpjValido,
  validarPrazoCoerente,
} from '../../domain/regras-consistencia.js';
import type { CriarOrcamentoValidacaoRepositorio } from '../../domain/repositories/orcamento-validacao.repository.js';
import { DadosExtraidosParaValidacao } from '../../domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../domain/value-objects/periodo-validade.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import {
  OrcamentoValidacaoNaoEncontradoError,
  TenantDivergenciaError,
} from './consultar-status-validacao.js';

export interface DecisaoHumanaValidacaoInput {
  readonly decisao: 'CORRECAO_APLICADA' | 'ACEITE_COM_RESSALVA';
  readonly justificativa: string;
  readonly dadosCorrigidos?: Record<string, unknown> | null;
}

/**
 * Endpoint REST de decisão humana (T036, `POST .../validacao/decisao-humana`).
 * Não decide o resultado da regra de negócio — só orquestra: busca o
 * agregado, delega a transição a `registrarDecisaoHumana` (única fonte da
 * regra "só a partir de PENDENTE_REVISAO_HUMANA", `TransicaoInvalidaValidacaoError`
 * quando violada), persiste e publica o evento que resultar do novo status
 * (plan.md).
 *
 * Se a correção ainda deixa inconsistência, o agregado permanece em
 * `PENDENTE_REVISAO_HUMANA` (nova tentativa apenas registrada no histórico)
 * — nenhum evento é publicado nesse caso (plan.md).
 */
export class RegistrarDecisaoHumanaValidacao {
  constructor(
    private readonly criarRepositorio: CriarOrcamentoValidacaoRepositorio,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(
    orcamentoId: string,
    tenantId: TenantId,
    decisao: DecisaoHumanaValidacao,
  ): Promise<void> {
    const id = OrcamentoId.de(orcamentoId);
    // (issue #656) Repositório construído por chamada a partir do `tenantId`
    // já validado do parâmetro — nunca reaproveitado como campo fixo entre
    // chamadas (ver `CriarOrcamentoValidacaoRepositorio`).
    const repositorio = this.criarRepositorio(tenantId);
    const validacao = await repositorio.buscarPorOrcamentoId(id);
    if (!validacao) {
      throw new OrcamentoValidacaoNaoEncontradoError(orcamentoId);
    }

    // (issue #656) Defesa em profundidade — ver `TenantDivergenciaError`.
    if (validacao.tenantId.toString() !== tenantId.toString()) {
      throw new TenantDivergenciaError(orcamentoId);
    }

    validacao.registrarDecisaoHumana(decisao);
    await repositorio.salvar(validacao);

    const evento = this.eventoParaStatus(validacao);
    if (evento) {
      await this.eventPublisher.publicar(evento);
    }
  }

  /**
   * Traduz o body HTTP (T036) para `DecisaoHumanaValidacao` — única fonte da
   * lógica "como reavaliar uma correção humana", movida do controller para
   * aqui (Application) porque orquestrar regra de negócio nunca é
   * responsabilidade da Interface. Reavalia as 3 regras determinísticas sem
   * I/O externo do Domain (`validarCnpjValido`, `validarCamposObrigatorios`,
   * `validarPrazoCoerente`, T010) sobre `dadosCorrigidos` mesclado ao
   * `dadosExtraidos` atual do agregado.
   *
   * ponytail: correção de item individual (`itens[]`) não é suportada nesta
   * primeira versão — só os 4 campos escalares de topo (`cnpjFornecedor`,
   * `condicoesComerciais`, `dataEmissaoProposta`, `periodoValidade`) são
   * lidos de `dadosCorrigidos`. `PRECO_FORA_DE_FAIXA`/`CNPJ_DIVERGENTE_CADASTRO`
   * exigem gateway (`ParametroFaixaPrecoGateway`/`FornecedorCadastradoGateway`,
   * T022/T023) — nunca recalculadas aqui, apenas carregadas do histórico do
   * agregado para nunca silenciar uma inconsistência real (ADR-001). Upgrade:
   * se correção de preço ou de CNPJ-cadastro via decisão humana virar
   * cenário real, injetar os mesmos gateways de `ValidarOrcamento` aqui.
   */
  construirDecisao(
    validacaoAtual: OrcamentoValidacao,
    input: DecisaoHumanaValidacaoInput,
  ): DecisaoHumanaValidacao {
    if (input.decisao === 'ACEITE_COM_RESSALVA') {
      return { tipo: 'ACEITE_COM_RESSALVA', justificativa: input.justificativa };
    }

    const atual = validacaoAtual.dadosExtraidos;
    const corrigidos = input.dadosCorrigidos ?? {};

    const dadosParaReavaliacao = DadosExtraidosParaValidacao.de({
      cnpjFornecedor:
        typeof corrigidos.cnpjFornecedor === 'string'
          ? corrigidos.cnpjFornecedor
          : atual.cnpjFornecedor,
      itens: atual.itens,
      condicoesComerciais:
        typeof corrigidos.condicoesComerciais === 'string'
          ? corrigidos.condicoesComerciais
          : atual.condicoesComerciais,
      dataEmissaoProposta:
        typeof corrigidos.dataEmissaoProposta === 'string'
          ? new Date(corrigidos.dataEmissaoProposta)
          : atual.dataEmissaoProposta,
      periodoValidade:
        typeof corrigidos.periodoValidade === 'string'
          ? PeriodoValidade.de(new Date(corrigidos.periodoValidade))
          : atual.periodoValidade,
    });

    const inconsistenciasRecalculadas = [
      ...validarCnpjValido(dadosParaReavaliacao),
      ...validarCamposObrigatorios(dadosParaReavaliacao),
      ...validarPrazoCoerente(dadosParaReavaliacao),
    ];

    const inconsistenciasMantidas = validacaoAtual.inconsistencias.filter(
      (inconsistencia) =>
        inconsistencia.regra === 'PRECO_FORA_DE_FAIXA' ||
        inconsistencia.regra === 'CNPJ_DIVERGENTE_CADASTRO',
    );

    return {
      tipo: 'CORRECAO_APLICADA',
      justificativa: input.justificativa,
      inconsistencias: [...inconsistenciasMantidas, ...inconsistenciasRecalculadas],
    };
  }

  private eventoParaStatus(
    validacao: OrcamentoValidacao,
  ): OrcamentoValidado | OrcamentoValidadoComRessalva | undefined {
    const orcamentoId = validacao.orcamentoId.toString();
    const itens = validacao.dadosExtraidos.itens.map((item) => item.paraPayload());
    const condicoesComerciais = validacao.dadosExtraidos.condicoesComerciais;

    if (validacao.status !== 'VALIDADO' && validacao.status !== 'VALIDADO_COM_RESSALVA') {
      return undefined;
    }

    // (issue #656 — aperto de tipo) `OrcamentoValidacao.tenantId` é
    // obrigatório desde a criação — sempre concreto aqui (guard
    // `OrcamentoValidacaoSemTenantIdError` removido: tornou-se inalcançável).
    const tenantId = validacao.tenantId.toString();

    if (validacao.status === 'VALIDADO') {
      return new OrcamentoValidado(orcamentoId, itens, condicoesComerciais, tenantId);
    }
    return new OrcamentoValidadoComRessalva(
      orcamentoId,
      validacao.inconsistencias.map((inconsistencia) => inconsistencia.paraPayload()),
      itens,
      condicoesComerciais,
      tenantId,
    );
  }
}
