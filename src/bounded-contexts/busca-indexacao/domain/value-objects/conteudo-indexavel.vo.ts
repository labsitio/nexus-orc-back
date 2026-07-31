import { ErroDominio } from '../errors/erro-dominio.js';

export class ConteudoIndexavelInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`ConteudoIndexavel inválido: ${mensagem}`);
  }
}

export interface ConteudoIndexavelProps {
  readonly resumoFornecedor: string;
  readonly itensDescricao: readonly string[];
  readonly condicoesResumo: string;
  readonly categorias: readonly string[];
}

/**
 * Texto estruturado (nunca opaco) derivado dos itens/condições/fornecedor
 * recebidos no payload upstream (`OrcamentoValidado`/
 * `OrcamentoValidadoComRessalva`, via `OrcamentoValidadoEventACL`) — nunca
 * reinterpreta/altera o valor estruturado já validado, apenas concatena/
 * formata para servir de insumo ao `AgenteEmbeddingGateway` (plan.md).
 * Construtor valida não-vazio: um `ConteudoIndexavel` sem nenhum conteúdo
 * real é erro de domínio, nunca uma "indexação válida" de conteúdo nulo.
 */
export class ConteudoIndexavel {
  private constructor(
    readonly resumoFornecedor: string,
    readonly itensDescricao: readonly string[],
    readonly condicoesResumo: string,
    readonly categorias: readonly string[],
  ) {}

  static de(props: ConteudoIndexavelProps): ConteudoIndexavel {
    const temItemComTexto = props.itensDescricao.some((item) => item.trim().length > 0);
    const temAlgumConteudo =
      props.resumoFornecedor.trim().length > 0 ||
      temItemComTexto ||
      props.condicoesResumo.trim().length > 0 ||
      props.categorias.some((categoria) => categoria.trim().length > 0);

    if (!temAlgumConteudo) {
      throw new ConteudoIndexavelInvalidoError(
        'nenhum campo (resumoFornecedor, itensDescricao, condicoesResumo, categorias) tem conteúdo — não pode ser inteiramente vazio',
      );
    }

    return new ConteudoIndexavel(
      props.resumoFornecedor,
      props.itensDescricao,
      props.condicoesResumo,
      props.categorias,
    );
  }

  /** Serialização em texto plano — único formato consumido pelo `AgenteEmbeddingGateway` (Infra). */
  paraTexto(): string {
    return [
      this.resumoFornecedor,
      ...this.itensDescricao,
      this.condicoesResumo,
      this.categorias.join(', '),
    ]
      .filter((parte) => parte.trim().length > 0)
      .join('\n');
  }
}
