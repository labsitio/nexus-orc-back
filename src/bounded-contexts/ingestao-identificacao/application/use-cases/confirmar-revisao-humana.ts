import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { Orcamento } from '../../domain/orcamento.aggregate.js';
import { OrcamentoReclassificadoPorRevisaoHumana } from '../../domain/events/orcamento-reclassificado-revisao-humana.event.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import { NivelConfianca } from '../../domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { ResultadoClassificacao } from '../../domain/value-objects/resultado-classificacao.vo.js';
import type { CriarOrcamentoRepositorio } from '../../domain/repositories/orcamento.repository.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

/** Confiança fixa de confirmação humana explícita — não é uma estimativa, é decisão humana direta. */
const CONFIANCA_CONFIRMACAO_HUMANA = 100;

export class OrcamentoNaoEncontradoParaRevisaoHumanaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Orçamento não encontrado para confirmação humana: ${orcamentoId}`);
  }
}

/**
 * (spec 007, T017) Disparado quando `tenantId` do agregado é ausente/undefined
 * (registro legado pré-retrofit) ou não corresponde ao `tenantId` da requisição
 * (tentativa de acesso cross-tenant). Retornado como 404 nunca 403, para não
 * revelar ao cliente a existência de um orçamento pertencente a outro tenant.
 */
export class TenantDivergenciaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Acesso negado ao orçamento: ${orcamentoId}`);
  }
}

export interface ConfirmarRevisaoHumanaParams {
  readonly orcamentoId: string;
  readonly fornecedorIdentificado: string;
  readonly formatoIdentificado: string;
  /**
   * (spec 007, T017) Vem sempre do `TenantContext` já validado (JWT Cognito
   * no controller HTTP) — NUNCA do body da requisição, isso seria escalação
   * de privilégio (cliente escolheria acessar outro tenant).
   */
  readonly tenantId: TenantId;
}

/**
 * Caso de uso `ConfirmarRevisaoHumana` (T052/#57). Acionado pelo endpoint
 * REST de confirmação (T053/#58) quando um orçamento escalonado para
 * revisão humana é confirmado explicitamente. Delega a validação de
 * transição ao próprio agregado (`Orcamento.registrarConfirmacaoHumana`,
 * T007/#12) — só é transição válida a partir de `PENDENTE_REVISAO_HUMANA`;
 * fora disso o agregado lança `TransicaoInvalidaError` (controller mapeia
 * para 409 Problem Details). Publica `OrcamentoReclassificadoPorRevisaoHumana`
 * ao final (T055/#60) — auditoria da correção manual (plan.md).
 */
export class ConfirmarRevisaoHumana {
  constructor(
    private readonly criarRepositorio: CriarOrcamentoRepositorio,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(params: ConfirmarRevisaoHumanaParams): Promise<Orcamento> {
    const id = OrcamentoId.de(params.orcamentoId);
    // (spec 007, T018) Repositório construído por chamada a partir do
    // `tenantId` já validado do parâmetro — nunca reaproveitado como campo
    // fixo entre chamadas (ver `CriarOrcamentoRepositorio`).
    const repositorio = this.criarRepositorio(params.tenantId);
    const orcamento = await repositorio.buscarPorId(id);
    if (!orcamento) {
      throw new OrcamentoNaoEncontradoParaRevisaoHumanaError(params.orcamentoId);
    }

    // (spec 007, T017) Validação explícita de tenant: rejeita se agregado não tem
    // tenantId (legado pré-retrofit) ou diverge do solicitante (cross-tenant). 404,
    // não 403 — não revela existência a outro tenant.
    if (!orcamento.tenantId || orcamento.tenantId.toString() !== params.tenantId.toString()) {
      throw new TenantDivergenciaError(params.orcamentoId);
    }

    const resultado = ResultadoClassificacao.criar({
      fornecedorIdentificado: params.fornecedorIdentificado,
      formatoIdentificado: params.formatoIdentificado,
      nivelConfianca: NivelConfianca.de(CONFIANCA_CONFIRMACAO_HUMANA),
      agenteOrigem: 'HUMANO',
    });

    orcamento.registrarConfirmacaoHumana(resultado);
    await repositorio.salvar(orcamento);

    await this.eventPublisher.publicar(
      new OrcamentoReclassificadoPorRevisaoHumana(orcamento.id.toString(), resultado.paraPayload()),
    );

    return orcamento;
  }
}
