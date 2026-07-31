import { CategoriaItem } from './categoria-item.vo.js';
import { Dinheiro } from './dinheiro.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class ItemParaValidacaoInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`ItemParaValidacao inválido: ${mensagem}`);
  }
}

export interface ItemParaValidacaoProps {
  readonly descricao: string;
  readonly quantidade: number;
  readonly precoUnitario: Dinheiro;
  readonly categoria?: CategoriaItem;
  readonly extraido: boolean;
}

/**
 * Item de orçamento traduzido para avaliação de regras de consistência.
 * `extraido` preserva, na tradução via `OrcamentoExtraidoEventACL`, se o
 * campo veio com pendência confirmada da Extração — necessário para a
 * regra "campo obrigatório preenchido" ainda reprovar itens com
 * pendência confirmada quando o campo é obrigatório para validação.
 * `categoria` é opcional até categorização (`AgenteCategorizadorItemGateway`).
 */
export class ItemParaValidacao {
  private constructor(
    readonly descricao: string,
    readonly quantidade: number,
    readonly precoUnitario: Dinheiro,
    readonly extraido: boolean,
    readonly categoria?: CategoriaItem,
  ) {}

  static de(props: ItemParaValidacaoProps): ItemParaValidacao {
    if (!props.descricao.trim()) {
      throw new ItemParaValidacaoInvalidoError('descricao não pode ser vazia');
    }
    if (!Number.isFinite(props.quantidade) || props.quantidade <= 0) {
      throw new ItemParaValidacaoInvalidoError(
        `quantidade deve ser > 0, recebido ${props.quantidade}`,
      );
    }
    return new ItemParaValidacao(
      props.descricao.trim(),
      props.quantidade,
      props.precoUnitario,
      props.extraido,
      props.categoria,
    );
  }
}
