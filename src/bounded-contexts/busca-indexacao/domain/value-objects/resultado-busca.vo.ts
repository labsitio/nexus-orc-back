import { OrcamentoId } from './orcamento-id.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class ResultadoBuscaInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`ResultadoBusca inválido: ${mensagem}`);
  }
}

export interface ResultadoBuscaProps {
  readonly orcamentoId: OrcamentoId;
  readonly scoreRelevancia: number;
  readonly trechoDestacado?: string;
}

/**
 * VO de apresentação de um item de resultado de busca — nunca decide
 * inclusão/exclusão do orçamento (isso é query na Infrastructure, não regra
 * de negócio). `scoreRelevancia` é normalizado a partir da distância vetorial
 * pgvector, sempre em [0, 1] (plan.md).
 */
export class ResultadoBusca {
  private constructor(
    readonly orcamentoId: OrcamentoId,
    readonly scoreRelevancia: number,
    readonly trechoDestacado?: string,
  ) {}

  static de(props: ResultadoBuscaProps): ResultadoBusca {
    if (
      Number.isNaN(props.scoreRelevancia) ||
      props.scoreRelevancia < 0 ||
      props.scoreRelevancia > 1
    ) {
      throw new ResultadoBuscaInvalidoError(
        `scoreRelevancia deve estar entre 0 e 1, recebido ${props.scoreRelevancia}`,
      );
    }
    return new ResultadoBusca(props.orcamentoId, props.scoreRelevancia, props.trechoDestacado);
  }
}
