import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { IndiceOrcamento } from '../../domain/aggregates/indice-orcamento.aggregate.js';
import type { IndiceOrcamentoRepository } from '../../domain/repositories/indice-orcamento.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';

export class IndiceOrcamentoNaoEncontradoError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Índice de indexação não encontrado para orçamento: ${orcamentoId}`);
  }
}

/**
 * Query read-only (T031/#191): `GET /v1/orcamentos/{orcamentoId}/indexacao/status`.
 * Nunca escreve no agregado/repositório; a tradução para o formato de
 * resposta HTTP é responsabilidade do controller
 * (`interface/http/indexacao-status.controller.ts`), mesmo padrão de
 * `validacao/application/use-cases/consultar-status-validacao.ts`.
 *
 * `repositorio` já chega tenant-scoped (instância construída pelo controller
 * a partir do `TenantContext` do JWT, `DrizzleTenantScopedRepositoryBase`/
 * ADR-005) — a query nunca vê linha de outro tenant graças à RLS. `tenantId`
 * ainda é comparado aqui como defesa em profundidade (mesmo racional do guard
 * de `DrizzlePgvectorIndiceOrcamentoRepository.upsert`, plan.md/ADR-005):
 * nunca confia apenas em uma camada para o isolamento cross-tenant. Um
 * `orcamentoId` de outro tenant sempre responde como "não encontrado", nunca
 * vaza a existência do orçamento (tasks.md T031).
 */
export class ConsultarStatusIndexacao {
  constructor(private readonly repositorio: IndiceOrcamentoRepository) {}

  async executar(tenantId: TenantId, orcamentoIdBruto: string): Promise<IndiceOrcamento> {
    const orcamentoId = OrcamentoId.de(orcamentoIdBruto);
    const indice = await this.repositorio.buscarPorOrcamentoId(orcamentoId);
    if (!indice || !indice.tenantId.equals(tenantId)) {
      throw new IndiceOrcamentoNaoEncontradoError(orcamentoIdBruto);
    }
    return indice;
  }
}
