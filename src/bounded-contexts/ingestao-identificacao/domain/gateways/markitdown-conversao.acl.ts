/**
 * Anti-Corruption Layer para a saída do MarkItDown — produz texto leve do
 * documento bruto. O texto retornado ainda é entrada não confiável do ponto
 * de vista de prompt do Classificador (sanitização fica em Infrastructure/Application,
 * nunca é interpretado como instrução — ver Segurança em plan.md).
 */
export interface MarkItDownConversaoACL {
  converterParaTexto(
    conteudoBruto: Uint8Array,
    nomeArquivo: string,
  ): Promise<string>;
}
