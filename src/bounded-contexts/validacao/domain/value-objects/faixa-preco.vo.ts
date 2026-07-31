import { CategoriaItem } from './categoria-item.vo.js';
import { Dinheiro } from './dinheiro.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class FaixaPrecoInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`FaixaPreco inválida: ${mensagem}`);
  }
}

/**
 * Faixa de preço esperada para uma categoria de item — parâmetro
 * configurável carregado via `ParametroFaixaPrecoGateway`
 * (tabela `faixas_preco_categoria`), nunca hardcoded no Domain.
 */
export class FaixaPreco {
  private constructor(
    readonly categoria: CategoriaItem,
    readonly precoMinimo: Dinheiro,
    readonly precoMaximo: Dinheiro,
  ) {}

  static de(categoria: CategoriaItem, precoMinimo: Dinheiro, precoMaximo: Dinheiro): FaixaPreco {
    if (precoMinimo.moeda !== precoMaximo.moeda) {
      throw new FaixaPrecoInvalidaError(
        `precoMinimo (${precoMinimo.moeda}) e precoMaximo (${precoMaximo.moeda}) devem ter a mesma moeda`,
      );
    }
    if (precoMinimo.valorCentavos > precoMaximo.valorCentavos) {
      throw new FaixaPrecoInvalidaError('precoMinimo não pode ser maior que precoMaximo');
    }
    return new FaixaPreco(categoria, precoMinimo, precoMaximo);
  }

  contem(preco: Dinheiro): boolean {
    return (
      preco.moeda === this.precoMinimo.moeda &&
      preco.valorCentavos >= this.precoMinimo.valorCentavos &&
      preco.valorCentavos <= this.precoMaximo.valorCentavos
    );
  }
}
