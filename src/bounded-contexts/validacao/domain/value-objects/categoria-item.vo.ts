import { ErroDominio } from '../errors/erro-dominio.js';

export class CategoriaItemInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`CategoriaItem inválida: ${mensagem}`);
  }
}

/**
 * Categoria de um item de orçamento — string não vazia, normalizada.
 * Pertencimento ao catálogo configurado (`faixas_preco_categoria`) é
 * responsabilidade do gateway que a fornece (`AgenteCategorizadorItemGateway`
 * ou `ParametroFaixaPrecoGateway`), não deste VO.
 */
export class CategoriaItem {
  private constructor(readonly valor: string) {}

  static de(valorBruto: string): CategoriaItem {
    const valor = valorBruto.trim();
    if (!valor) {
      throw new CategoriaItemInvalidaError('não pode ser vazia');
    }
    return new CategoriaItem(valor);
  }

  equals(outra: CategoriaItem): boolean {
    return this.valor === outra.valor;
  }

  paraPayload(): string {
    return this.valor;
  }
}
