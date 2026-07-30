/**
 * Sanitização do texto produzido pelo MarkItDown antes de ser usado como
 * insumo do prompt do Agente Classificador (mitigação de prompt injection —
 * ver "Segurança" em plan.md). O texto de um documento de fornecedor é
 * SEMPRE entrada não confiável: nunca cruza para o Domain, nunca é
 * interpretado como instrução, e nunca chega ao Bedrock sem passar por aqui.
 *
 * Esta função é consumida por `MarkItDownConversaoACL` (Infrastructure) antes
 * de retornar o texto convertido — o isolamento do texto em bloco delimitado
 * dentro do prompt e a validação da resposta estruturada do Bedrock são
 * responsabilidade das camadas seguintes (`BedrockClassificadorGateway`).
 */

/** Tamanho máximo de texto aceito como insumo do prompt (evita DoS por documento gigante). */
export const TAMANHO_MAXIMO_CONTEUDO_SANITIZADO = 50_000;

const TABULACAO = 0x09;
const NOVA_LINHA = 0x0a;
const RETORNO_CARRO = 0x0d;
const DEL = 0x7f;

/** Caracteres de controle preservados por serem formatação legítima de texto. */
function ehCaractereControlePreservado(codigo: number): boolean {
  return codigo === TABULACAO || codigo === NOVA_LINHA || codigo === RETORNO_CARRO;
}

/** Caractere de controle ASCII (usado historicamente para ofuscar instruções ou confundir parsers). */
function ehCaractereControle(codigo: number): boolean {
  return (codigo >= 0x00 && codigo <= 0x1f) || codigo === DEL;
}

/**
 * Remove caracteres de controle não-legítimos e trunca o texto ao tamanho
 * máximo aceito. Nunca lança erro — entrada vazia ou inválida resulta em
 * string vazia, nunca interrompe o pipeline de classificação.
 */
export function sanitizarConteudoDocumento(textoBruto: string): string {
  if (!textoBruto) {
    return '';
  }

  let resultado = '';
  for (const caractere of textoBruto) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (ehCaractereControle(codigo) && !ehCaractereControlePreservado(codigo)) {
      continue;
    }
    resultado += caractere;
    if (resultado.length >= TAMANHO_MAXIMO_CONTEUDO_SANITIZADO) {
      break;
    }
  }
  return resultado.slice(0, TAMANHO_MAXIMO_CONTEUDO_SANITIZADO);
}
