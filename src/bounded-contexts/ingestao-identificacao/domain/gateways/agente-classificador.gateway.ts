/**
 * Resultado bruto do agente Classificador (Bedrock), antes do ACL validar e
 * produzir `ResultadoClassificacao` (VO) — `nivelConfianca` ainda é `number` solto aqui
 * porque a validação de faixa é responsabilidade do ACL/Application, nunca do Domain
 * confiar ciegamente no LLM (plan.md, Princípio IV).
 *
 * `formatoIdentificado` não faz parte deste contrato (ADR-012): o gateway só recebe o
 * texto já convertido, sem nome de arquivo/extensão/MIME — identificar o formato
 * original a partir do texto é adivinhação, não inferência. No caminho automático,
 * `formatoIdentificado` é derivado deterministicamente pela Application a partir do
 * nome do arquivo (`classificar-orcamento.ts`).
 */
export interface ResultadoAgenteClassificador {
  readonly fornecedorIdentificado: string;
  readonly nivelConfianca: number;
}

/** Contrato do agente Classificador — implementado em Infrastructure sobre Bedrock. */
export interface AgenteClassificadorGateway {
  classificar(textoDocumento: string): Promise<ResultadoAgenteClassificador>;
}
