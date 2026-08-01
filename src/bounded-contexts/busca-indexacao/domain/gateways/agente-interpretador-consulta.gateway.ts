import type { CriterioBusca } from '../value-objects/criterio-busca.vo.js';

export interface AgenteInterpretadorConsultaInput {
  /** Consulta em linguagem natural do gestor de compras — entrada de texto livre, processada por LLM (mitigação de prompt injection via bloco delimitado de conteúdo, plan.md). */
  readonly consultaLinguagemNatural: string;
  /** Catálogo configurado (`faixas_preco_categoria`) — a saída MUST restringir `categoria` a este conjunto, nunca inventar filtro fora dele. */
  readonly catalogoCategorias: readonly string[];
}

/**
 * Interpretação semântica de consulta em linguagem natural via IA generativa
 * (Bedrock) — implementado na Infrastructure
 * (`BedrockInterpretadorConsultaGateway` + `BedrockInterpretacaoConsultaACL`,
 * T037) com saída estruturada (tool-use/JSON Schema) restrita ao
 * `catalogoCategorias` informado, nunca texto livre interpretado por regex.
 * Retorna sempre `CriterioBusca` validado; a mesclagem com filtros explícitos
 * da requisição (que nunca são sobrescritos pela interpretação, apenas
 * complementados) é responsabilidade do caso de uso `BuscarOrcamentos`
 * (Application), não deste gateway.
 */
export interface AgenteInterpretadorConsultaGateway {
  interpretar(input: AgenteInterpretadorConsultaInput): Promise<CriterioBusca>;
}
