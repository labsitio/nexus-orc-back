import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { Orcamento } from '../../domain/orcamento.aggregate.js';
import type { CriarOrcamentoRepositorio } from '../../domain/repositories/orcamento.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

export class OrcamentoNaoEncontradoError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Orçamento não encontrado: ${orcamentoId}`);
  }
}

/**
 * (fix #640) Mesmo par de motivos usado por `TenantDivergenciaError` de
 * `classificar-orcamento.ts` — ubiquitous language da fronteira de tenant
 * neste BC. `AUSENTE`: agregado sem `tenantId`, nunca esperado hoje (ADR-011,
 * `tenant_id` é NOT NULL desde a migração 0013). `DIVERGENTE`: `tenantId` do
 * solicitante diverge do agregado (cross-tenant), acesso corretamente negado.
 */
export type MotivoTenantDivergencia = 'AUSENTE' | 'DIVERGENTE';

/**
 * (spec 007, T017; ADR-011) Disparado quando `tenantId` do agregado é
 * ausente/undefined (estado hoje inesperado — `tenant_id` é NOT NULL desde a
 * migração 0013) ou não corresponde ao `tenantId` da requisição (tentativa de
 * acesso cross-tenant). Retornado como 404 nunca 403, para não revelar ao
 * cliente a existência de um orçamento pertencente a outro tenant.
 */
export class TenantDivergenciaError extends ErroDominio {
  /**
   * (T049/#54, ADR-016) Só `AUSENTE` representa a métrica "orçamento sem
   * status consultável" (spec 001, Métricas de Avaliação Contínua): o
   * orçamento foi recebido e existe, mas está estruturalmente inconsultável
   * por estado inesperado do dado. `DIVERGENTE` é acesso corretamente negado
   * a dado de outro tenant — não é anomalia, não entra na métrica.
   */
  constructor(
    orcamentoId: string,
    readonly motivo: MotivoTenantDivergencia,
  ) {
    super(`Acesso negado ao orçamento: ${orcamentoId}`);
  }
}

/**
 * Query read-only (T046/#51) — nunca escreve no agregado nem no repositório.
 * Retorna o agregado completo (status atual + histórico append-only); a
 * tradução para o formato de resposta HTTP é responsabilidade do controller
 * (T047/#52, `interface/http/status.schema.ts`).
 */
export class ConsultarStatusOrcamento {
  constructor(private readonly criarRepositorio: CriarOrcamentoRepositorio) {}

  async executar(orcamentoId: string, tenantId: TenantId): Promise<Orcamento> {
    const id = OrcamentoId.de(orcamentoId);
    // (spec 007, T018) Repositório construído por chamada a partir do
    // `tenantId` já validado do parâmetro — nunca reaproveitado como campo
    // fixo entre chamadas (ver `CriarOrcamentoRepositorio`).
    const orcamento = await this.criarRepositorio(tenantId).buscarPorId(id);
    if (!orcamento) {
      throw new OrcamentoNaoEncontradoError(orcamentoId);
    }

    // (spec 007, T017; ADR-011) Validação explícita de tenant: rejeita se agregado
    // não tem tenantId (estado hoje inesperado) ou diverge do solicitante
    // (cross-tenant). 404, não 403 — não revela existência a outro tenant.
    if (!orcamento.tenantId) {
      throw new TenantDivergenciaError(orcamentoId, 'AUSENTE');
    }
    if (orcamento.tenantId.toString() !== tenantId.toString()) {
      throw new TenantDivergenciaError(orcamentoId, 'DIVERGENTE');
    }

    return orcamento;
  }
}
