import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import type { MarkItDownConversaoExtracaoACL as MarkItDownConversaoExtracaoACLPort } from '../domain/gateways/markitdown-conversao-extracao.acl.js';
import { sanitizarConteudoExtracao } from './sanitizar-conteudo-extracao.js';

/** Payload enviado ao Lambda/layer dedicado ao MarkItDown deste BC (instância própria — ADR-002). */
interface MarkItDownInvokePayload {
  conteudoBase64: string;
  nomeArquivo: string;
}

/** Contrato de resposta do Lambda dedicado — texto bruto, ainda não sanitizado. */
interface MarkItDownInvokeResponse {
  texto: string;
}

function ehMarkItDownInvokeResponse(valor: unknown): valor is MarkItDownInvokeResponse {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as Record<string, unknown>).texto === 'string'
  );
}

/**
 * Implementa `MarkItDownConversaoExtracaoACL` invocando um Lambda dedicado
 * (Python + MarkItDown) — instância própria deste BC (ADR-002), nunca
 * compartilhada com a conversão leve da spec 001. O texto retornado passa
 * por `sanitizarConteudoExtracao` antes de sair do ACL — nunca repassa o
 * texto bruto do MarkItDown para o Application/Domain (Segurança, plan.md).
 */
export class MarkItDownConversaoExtracaoACL implements MarkItDownConversaoExtracaoACLPort {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly functionName: string,
  ) {}

  async converter(bruto: Buffer, nomeArquivo: string): Promise<string> {
    const payload: MarkItDownInvokePayload = {
      conteudoBase64: bruto.toString('base64'),
      nomeArquivo,
    };

    const resultado = await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        Payload: Buffer.from(JSON.stringify(payload)),
      }),
    );

    if (resultado.FunctionError) {
      throw new Error(
        `Lambda MarkItDown "${this.functionName}" retornou erro: ${resultado.FunctionError}`,
      );
    }
    if (!resultado.Payload) {
      throw new Error(`Lambda MarkItDown "${this.functionName}" não retornou payload`);
    }

    let corpo: unknown;
    try {
      corpo = JSON.parse(Buffer.from(resultado.Payload).toString('utf-8'));
    } catch {
      throw new Error(
        `Lambda MarkItDown "${this.functionName}" retornou payload em formato inesperado (JSON inválido)`,
      );
    }
    if (!ehMarkItDownInvokeResponse(corpo)) {
      throw new Error(
        `Lambda MarkItDown "${this.functionName}" retornou payload em formato inesperado`,
      );
    }

    return sanitizarConteudoExtracao(corpo.texto);
  }
}
