import type { Orcamento } from "../orcamento.aggregate.js";
import type { OrcamentoId } from "../value-objects/orcamento-id.vo.js";

/** Contrato de persistência do agregado — implementado em Infrastructure sobre Drizzle/Aurora. */
export interface OrcamentoRepository {
  salvar(orcamento: Orcamento): Promise<void>;
  buscarPorId(id: OrcamentoId): Promise<Orcamento | undefined>;
}
