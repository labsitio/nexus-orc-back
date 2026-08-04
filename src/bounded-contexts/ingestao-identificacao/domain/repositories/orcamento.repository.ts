import type { Orcamento } from '../orcamento.aggregate.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

/** Contrato de persistência do agregado — implementado em Infrastructure sobre Drizzle/Aurora. */
export interface OrcamentoRepository {
  salvar(orcamento: Orcamento): Promise<void>;
  buscarPorId(id: OrcamentoId): Promise<Orcamento | undefined>;
}

/**
 * (spec 007, T018) Fábrica de `OrcamentoRepository` por `tenantId` — nunca uma
 * instância pronta. `DrizzleOrcamentoRepository` estende
 * `DrizzleTenantScopedRepositoryBase` (T008): o `TenantContext` é fixado no
 * construtor e MUST NUNCA ser reaproveitado entre tenants, então os 4 casos de
 * uso deste BC recebem esta fábrica em vez de um `OrcamentoRepository` fixo, e
 * chamam-na dentro de `executar()` com o `tenantId` já recebido por parâmetro
 * (da requisição HTTP ou do evento SQS/S3) — nunca guardada como campo de
 * instância de longa duração (isso seria o mesmo vazamento cross-tenant que a
 * classe base previne). Um handler Lambda processando um lote com múltiplos
 * tenants (ex. `classificador-queue.handler.ts`) obtém uma transação/sessão
 * `SET LOCAL` correta por chamada, mesmo reaproveitando o mesmo caso de uso
 * (singleton da composition root) entre invocações de warm start.
 */
export type CriarOrcamentoRepositorio = (tenantId: TenantId) => OrcamentoRepository;
