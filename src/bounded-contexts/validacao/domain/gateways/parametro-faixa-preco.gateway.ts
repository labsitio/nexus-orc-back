import type { FaixaPreco } from '../value-objects/faixa-preco.vo.js';

/**
 * Leitura do parâmetro de configuração operacional "faixa de preço esperada
 * por categoria" (tabela `faixas_preco_categoria`) — nunca valor hardcoded
 * no Domain (critério de aceite spec.md "parametrizável sem nova spec").
 * Implementado na Infrastructure (`DrizzleFaixaPrecoRepository`, T023);
 * escrita (upsert de configuração, US3/T043) é responsabilidade adicional
 * do mesmo componente de Infra, fora do escopo desta interface por ora
 * (YAGNI até a regra de preço/categorização exigir).
 */
export interface ParametroFaixaPrecoGateway {
  listarTodas(): Promise<readonly FaixaPreco[]>;
}
