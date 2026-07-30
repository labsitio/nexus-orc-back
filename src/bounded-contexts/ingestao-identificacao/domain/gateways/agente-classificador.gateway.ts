/**
 * Resultado bruto do agente Classificador (Bedrock), antes do ACL validar e
 * produzir `ResultadoClassificacao` (VO) — `nivelConfianca` ainda é `number` solto aqui
 * porque a validação de faixa é responsabilidade do ACL/Application, nunca do Domain
 * confiar ciegamente no LLM (plan.md, Princípio IV).
 */
export interface ResultadoAgenteClassificador {
  readonly fornecedorIdentificado: string;
  readonly formatoIdentificado: string;
  readonly nivelConfianca: number;
}

/** Contrato do agente Classificador — implementado em Infrastructure sobre Bedrock. */
export interface AgenteClassificadorGateway {
  classificar(textoDocumento: string): Promise<ResultadoAgenteClassificador>;
}
