import type { AssinaturaEstrutural } from '../value-objects/assinatura-estrutural.js';
import type { ResultadoClassificacao } from '../value-objects/resultado-classificacao.vo.js';
import type { SinalCacheIdentificacao } from '../value-objects/sinal-cache-identificacao.js';

/**
 * Contrato do cache de identificação de fornecedor/formato (plan.md, spec-009) —
 * implementado em Infrastructure sobre DynamoDB. Falha de leitura/escrita (throttle,
 * timeout) é responsabilidade da implementação: MUST degradar para `null`/no-op,
 * nunca propagar exceção para `ClassificarOrcamento`.
 */
export interface CacheIdentificacaoGateway {
  buscar(assinatura: AssinaturaEstrutural): Promise<SinalCacheIdentificacao | null>;
  registrar(assinatura: AssinaturaEstrutural, resultado: ResultadoClassificacao): Promise<void>;
}
