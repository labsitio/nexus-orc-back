import type { TenantId } from './tenant-id.vo.js';

/**
 * `TenantContext` — Shared Kernel (ADR-004 de `specs/007-isolamento-multitenant-dados/plan.md`).
 * Request-scoped: uma instância por requisição/mensagem, criada pelo
 * `TenantContextMiddleware` (T005) a partir do claim JWT já validado.
 * MUST NUNCA ser guardado em estado de módulo/singleton — isso vazaria o
 * tenant de uma requisição para outra sob concorrência (guardrail de
 * isolamento desta spec). `readonly` + `Object.freeze` só evitam mutação
 * acidental do objeto em si; a garantia real de escopo por requisição é de
 * quem chama `criarTenantContext` (Interface), não deste tipo.
 */
export interface TenantContext {
  readonly tenantId: TenantId;
}

export function criarTenantContext(tenantId: TenantId): TenantContext {
  return Object.freeze({ tenantId });
}
