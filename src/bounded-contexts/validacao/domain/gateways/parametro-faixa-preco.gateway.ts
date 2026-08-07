import type { FaixaPreco } from '../value-objects/faixa-preco.vo.js';

/**
 * Leitura/escrita do parâmetro de configuração operacional "faixa de preço
 * esperada por categoria" (tabela `faixas_preco_categoria`) — nunca valor
 * hardcoded no Domain (critério de aceite spec.md "parametrizável sem nova
 * spec"). Implementado na Infrastructure (`DrizzleFaixaPrecoRepository`,
 * T023/T043).
 *
 * Parâmetro global de catálogo, não dado de orçamento por tenant: `plan.md`
 * (seção Interface, "Nota de complexidade") descreve `categoria` como a
 * própria chave de configuração, sem variante por tenant; o contrato REST
 * (T038, `faixa-preco-categoria.schema.ts`) e o consumidor já mergeado
 * (`ValidarOrcamento`, T042) tampouco carregam `tenantId` nesta leitura —
 * por isso `DrizzleFaixaPrecoRepository` não estende
 * `DrizzleTenantScopedRepositoryBase` (retrofit 007 escopa tenant-scoping a
 * "dado de orçamento", `specs/007-.../plan.md` regra 4). Igualar este
 * catálogo compartilhado à RLS por tenant é decisão de arquitetura nova,
 * fora do escopo de T043 — sinalizado ao `arquiteto-back` caso a spec 007
 * ou uma spec futura decida o contrário.
 */
export interface ParametroFaixaPrecoGateway {
  listarTodas(): Promise<readonly FaixaPreco[]>;

  /**
   * Upsert por `categoria` (chave de conflito = PK da tabela): configuração
   * nova insere linha, categoria já existente sobrescreve `precoMinimo`/
   * `precoMaximo`/`moeda` (última escrita ganha — transaction script sem
   * agregado, `plan.md`).
   */
  upsert(faixaPreco: FaixaPreco): Promise<void>;
}
