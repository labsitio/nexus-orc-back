import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import type { MarkItDownConversaoACL as MarkItDownConversaoACLPort } from '../domain/gateways/markitdown-conversao.acl.js';
import { sanitizarConteudoDocumento } from './sanitizar-conteudo-documento.js';

/** Payload enviado ao Lambda/layer dedicado ao MarkItDown (CPU-bound, isolado do handler síncrono — plan.md). */
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
 * Implementa `MarkItDownConversaoACL` invocando um Lambda dedicado (Python +
 * MarkItDown), isolado do handler síncrono do `BedrockClassificadorGateway`
 * por ser CPU-bound (plan.md, seção Constraints). O texto retornado passa
 * por `sanitizarConteudoDocumento` antes de sair do ACL — nunca repassa o
 * texto bruto do MarkItDown para o Application/Domain.
 */
export class MarkItDownConversaoACL implements MarkItDownConversaoACLPort {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly functionName: string,
  ) {}

  async converterParaTexto(conteudoBruto: Uint8Array, nomeArquivo: string): Promise<string> {
    const payload: MarkItDownInvokePayload = {
      conteudoBase64: Buffer.from(conteudoBruto).toString('base64'),
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

    const corpo: unknown = JSON.parse(Buffer.from(resultado.Payload).toString('utf-8'));
    if (!ehMarkItDownInvokeResponse(corpo)) {
      throw new Error(
        `Lambda MarkItDown "${this.functionName}" retornou payload em formato inesperado`,
      );
    }

    return sanitizarConteudoDocumento(corpo.texto);
  }
}
