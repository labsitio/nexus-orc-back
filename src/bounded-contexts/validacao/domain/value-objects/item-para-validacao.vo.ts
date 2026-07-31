import { CategoriaItem } from './categoria-item.vo.js';
import { Dinheiro, type DinheiroPayload } from './dinheiro.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class ItemParaValidacaoInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`ItemParaValidacao inválido: ${mensagem}`);
  }
}

export interface ItemParaValidacaoProps {
  readonly descricao?: string;
  readonly quantidade: number;
  readonly precoUnitario: Dinheiro;
  readonly categoria?: CategoriaItem;
  readonly extraido: boolean;
}

export interface ItemParaValidacaoPayload {
  readonly descricao?: string;
  readonly quantidade: number;
  readonly precoUnitario: DinheiroPayload;
  readonly categoria?: string;
  readonly extraido: boolean;
}

/**
 * Item de orçamento traduzido para avaliação de regras de consistência.
 * `extraido` preserva, na tradução via `OrcamentoExtraidoEventACL`, se o
 * campo veio com pendência confirmada da Extração — necessário para a
 * regra "campo obrigatório preenchido" (T010) ainda reprovar itens com
 * pendência confirmada quando o campo é obrigatório para validação:
 * `descricao` ausente (`undefined`) representa exatamente esse caso —
 * Validação nunca herda a decisão de aceite da Extração (plan.md), então
 * `descricao` MUST poder faltar mesmo com `extraido: false`, para que a
 * regra "campos obrigatórios preenchidos" (T010) tenha algo a reprovar.
 * `categoria` é opcional até categorização (`AgenteCategorizadorItemGateway`).
 */
export class ItemParaValidacao {
  private constructor(
    readonly quantidade: number,
    readonly precoUnitario: Dinheiro,
    readonly extraido: boolean,
    readonly descricao?: string,
    readonly categoria?: CategoriaItem,
  ) {}

  static de(props: ItemParaValidacaoProps): ItemParaValidacao {
    if (props.descricao !== undefined && !props.descricao.trim()) {
      throw new ItemParaValidacaoInvalidoError(
        'descricao, quando informada, não pode ser string vazia — omita o campo para representar ausência',
      );
    }
    if (!Number.isFinite(props.quantidade) || props.quantidade <= 0) {
      throw new ItemParaValidacaoInvalidoError(
        `quantidade deve ser > 0, recebido ${props.quantidade}`,
      );
    }
    return new ItemParaValidacao(
      props.quantidade,
      props.precoUnitario,
      props.extraido,
      props.descricao?.trim(),
      props.categoria,
    );
  }

  paraPayload(): ItemParaValidacaoPayload {
    return {
      quantidade: this.quantidade,
      precoUnitario: this.precoUnitario.paraPayload(),
      extraido: this.extraido,
      ...(this.descricao !== undefined ? { descricao: this.descricao } : {}),
      ...(this.categoria !== undefined ? { categoria: this.categoria.paraPayload() } : {}),
    };
  }
}
