/**
 * Anti-Corruption Layer da conversão MarkItDown (instância própria deste BC,
 * ADR-002 — conversão completa/estruturável, distinta da versão leve da spec 001).
 * Implementado na Infrastructure. Sanitiza o texto convertido antes de compor
 * o prompt do Extrator — mitigação de prompt injection via documento de
 * fornecedor (conteúdo é sempre entrada não confiável, plan.md/Segurança).
 */
export interface MarkItDownConversaoExtracaoACL {
  converter(bruto: Buffer): Promise<string>;
}
