import { ErroDominio } from "../errors/erro-dominio.js";

const FORMATO_HASH_SHA256_HEX = /^[a-f0-9]{64}$/;

export class AssinaturaEstruturalInvalidaError extends ErroDominio {
  constructor(valor: string) {
    super(
      `AssinaturaEstrutural inválida: "${valor}" — esperado hash SHA-256 hexadecimal (64 caracteres, minúsculo)`,
    );
  }
}

/**
 * String opaca (hash determinístico) usada como chave de agrupamento heurístico
 * de estrutura/layout de orçamento + Canal — nunca uma identidade de fornecedor
 * confirmada (plan.md, spec-009). Apenas valida o formato do hash; o cálculo
 * (a partir da saída sanitizada do MarkItDownConversaoACL + Canal) é
 * responsabilidade da Application/Infrastructure (T010), nunca deste VO.
 */
export class AssinaturaEstrutural {
  private constructor(readonly valor: string) {}

  static de(valor: string): AssinaturaEstrutural {
    if (!FORMATO_HASH_SHA256_HEX.test(valor)) {
      throw new AssinaturaEstruturalInvalidaError(valor);
    }
    return new AssinaturaEstrutural(valor);
  }

  equals(outra: AssinaturaEstrutural): boolean {
    return this.valor === outra.valor;
  }
}
