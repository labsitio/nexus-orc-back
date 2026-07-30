import { ErroDominio } from '../errors/erro-dominio.js';

export class DescricaoProdutoInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`DescricaoProduto inválida: ${mensagem}`);
  }
}

export interface DescricaoProdutoPayload {
  readonly descricao: string;
  readonly sku?: string;
}

/** SKU/descrição do produto — nunca `string` solta. */
export class DescricaoProduto {
  private constructor(
    readonly descricao: string,
    readonly sku?: string,
  ) {}

  static de(descricao: string, sku?: string): DescricaoProduto {
    if (!descricao.trim()) {
      throw new DescricaoProdutoInvalidaError('descricao não pode ser vazia');
    }
    return new DescricaoProduto(descricao, sku);
  }

  equals(outra: DescricaoProduto): boolean {
    return this.descricao === outra.descricao && this.sku === outra.sku;
  }

  paraPayload(): DescricaoProdutoPayload {
    return { descricao: this.descricao, sku: this.sku };
  }
}
