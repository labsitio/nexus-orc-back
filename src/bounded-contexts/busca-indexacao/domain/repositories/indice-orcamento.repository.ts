import type { IndiceOrcamento } from '../aggregates/indice-orcamento.aggregate.js';
import type { CriterioBusca } from '../value-objects/criterio-busca.vo.js';
import type { Embedding } from '../value-objects/embedding.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import type { ResultadoBusca } from '../value-objects/resultado-busca.vo.js';

/**
 * Persistência do agregado `IndiceOrcamento` — implementada na Infrastructure
 * (`DrizzlePgvectorIndiceOrcamentoRepository`, T016) sobre Aurora Serverless
 * v2 Postgres + extensão `pgvector`. Traduz linha↔agregado, nunca vaza o tipo
 * `vector` bruto para fora da Infra (plan.md).
 */
export interface IndiceOrcamentoRepository {
  /**
   * Upsert idempotente por `orcamentoId` — necessário para retry
   * (`registrarTentativaIndexacao` a partir de `FALHA_INDEXACAO`, T012):
   * persiste estado atual + anexa a(s) nova(s) entrada(s) de histórico,
   * nunca sobrescreve/apaga uma tentativa anterior (`indices_orcamento_historico`
   * é append-only).
   */
  upsert(indiceOrcamento: IndiceOrcamento): Promise<void>;

  buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<IndiceOrcamento | undefined>;

  /**
   * Busca híbrida (US2): filtro SQL determinístico (categoria/preço/período,
   * `AND`) combinado com `ORDER BY embedding <=> :vetorConsulta LIMIT :n`
   * (distância cosseno pgvector) — a IA nunca decide quais orçamentos
   * existem/passam nos filtros, isso é sempre determinístico aqui (plan.md).
   * `vetorConsulta` é opcional: `textoLivreResidual` pode ser vazio quando os
   * filtros explícitos já bastam, e nesse caso a busca é puramente pelo
   * filtro determinístico.
   */
  buscarPorCriterioEVetor(
    criterio: CriterioBusca,
    vetorConsulta: Embedding | undefined,
    limite: number,
  ): Promise<readonly ResultadoBusca[]>;
}
