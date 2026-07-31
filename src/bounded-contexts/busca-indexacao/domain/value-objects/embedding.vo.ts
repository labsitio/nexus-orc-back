import { ErroDominio } from '../errors/erro-dominio.js';

export class EmbeddingInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`Embedding inválido: ${mensagem}`);
  }
}

export interface EmbeddingProps {
  readonly vetor: readonly number[];
  readonly dimensao: number;
  readonly modeloId: string;
  readonly geradoEm: Date;
}

/**
 * VO "de dados" — representação vetorial (embedding) de um `ConteudoIndexavel`,
 * produzida pelo `AgenteEmbeddingGateway` (Bedrock, Titan Text Embeddings V2).
 * Construtor valida apenas `vetor.length === dimensao`; nenhuma lógica de
 * similaridade/distância aqui — comparação vetorial não é regra de negócio,
 * é operação de banco (pgvector), responsabilidade da Infrastructure/query,
 * nunca do Domain (plan.md).
 */
export class Embedding {
  private constructor(
    readonly vetor: readonly number[],
    readonly dimensao: number,
    readonly modeloId: string,
    readonly geradoEm: Date,
  ) {}

  static de(props: EmbeddingProps): Embedding {
    if (props.vetor.length !== props.dimensao) {
      throw new EmbeddingInvalidoError(
        `vetor.length (${props.vetor.length}) deve ser igual a dimensao (${props.dimensao})`,
      );
    }
    if (Number.isNaN(props.geradoEm.getTime())) {
      throw new EmbeddingInvalidoError('geradoEm inválido');
    }
    if (!props.modeloId.trim()) {
      throw new EmbeddingInvalidoError('modeloId não pode ser vazio');
    }
    return new Embedding([...props.vetor], props.dimensao, props.modeloId, props.geradoEm);
  }
}
