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

    // (spec 007, T017) Validação explícita de tenant: rejeita se agregado não tem
    // tenantId (legado pré-retrofit) ou diverge do solicitante (cross-tenant). 404,
    // não 403 — não revela existência a outro tenant.
    if (!orcamento.tenantId || orcamento.tenantId.toString() !== tenantId.toString()) {
      throw new TenantDivergenciaError(orcamentoId);
    }

    return orcamento;
  }
}
