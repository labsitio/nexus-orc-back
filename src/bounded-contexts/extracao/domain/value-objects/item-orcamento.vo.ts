import type { CampoExtraido, CampoExtraidoPayload } from './campo-extraido.vo.js';
import type { Dinheiro, DinheiroPayload } from './dinheiro.vo.js';
import type { DescricaoProduto, DescricaoProdutoPayload } from './descricao-produto.vo.js';
import type { Quantidade } from './quantidade.vo.js';

export interface ItemOrcamentoParams {
  readonly descricao: CampoExtraido<DescricaoProduto>;
  readonly quantidade: CampoExtraido<Quantidade>;
  readonly precoUnitario: CampoExtraido<Dinheiro>;
}

export interface ItemOrcamentoPayload {
  readonly descricao: CampoExtraidoPayload<DescricaoProdutoPayload>;
  readonly quantidade: CampoExtraidoPayload<number>;
  readonly precoUnitario: CampoExtraidoPayload<DinheiroPayload>;
}

/**
 * Item do orçamento — cada campo é `CampoExtraido<T>`, nunca o valor cru
 * (invariante "nunca inventar valor" vive no VO do campo, não aqui).
 */
export class ItemOrcamento {
  private constructor(
    readonly descricao: CampoExtraido<DescricaoProduto>,
    readonly quantidade: CampoExtraido<Quantidade>,
    readonly precoUnitario: CampoExtraido<Dinheiro>,
  ) {}

  static de(params: ItemOrcamentoParams): ItemOrcamento {
    return new ItemOrcamento(params.descricao, params.quantidade, params.precoUnitario);
  }

  /** Todos os campos obrigatórios deste item têm confiança suficiente. */
  completo(): boolean {
    return this.descricao.extraido && this.quantidade.extraido && this.precoUnitario.extraido;
  }

  paraPayload(): ItemOrcamentoPayload {
    const descricao = this.descricao.paraPayload();
    const quantidade = this.quantidade.paraPayload();
    const precoUnitario = this.precoUnitario.paraPayload();
    return {
      descricao: {
        ...descricao,
        valor: descricao.valor ? descricao.valor.paraPayload() : null,
      },
      quantidade: { ...quantidade, valor: quantidade.valor?.valor ?? null },
      precoUnitario: {
        ...precoUnitario,
        valor: precoUnitario.valor ? precoUnitario.valor.paraPayload() : null,
      },
    };
  }
}
