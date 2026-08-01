import { ErroDominio } from '../errors/erro-dominio.js';

export class TentativaIndexacaoInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`TentativaIndexacao inválida: ${mensagem}`);
  }
}

export const RESULTADOS_TENTATIVA_INDEXACAO = ['INDEXADO', 'FALHA_TECNICA'] as const;

export type ResultadoTentativaIndexacao = (typeof RESULTADOS_TENTATIVA_INDEXACAO)[number];

export interface TentativaIndexacaoProps {
  readonly resultado: ResultadoTentativaIndexacao;
  readonly timestamp: Date;
  readonly modeloEmbedding?: string;
  readonly motivoFalha?: string;
}

/**
 * Entrada imutável do histórico append-only de `IndiceOrcamento.historico`
 * (plan.md) — cada chamada a `registrarTentativaIndexacao` anexa uma nova
 * `TentativaIndexacao`, nunca sobrescreve ou apaga uma anterior. Não há
 * limite estrutural de tentativas no Domain (retry sem limite — ADR-002);
 * o limite de tentativas é responsabilidade de infraestrutura (SQS
 * `maxReceiveCount` + DLQ).
 */
export class TentativaIndexacao {
  private constructor(
    readonly resultado: ResultadoTentativaIndexacao,
    readonly timestamp: Date,
    readonly modeloEmbedding: string | undefined,
    readonly motivoFalha: string | undefined,
  ) {}

  static de(props: TentativaIndexacaoProps): TentativaIndexacao {
    if (Number.isNaN(props.timestamp.getTime())) {
      throw new TentativaIndexacaoInvalidaError('timestamp inválido');
    }

    if (props.resultado === 'INDEXADO') {
      if (!props.modeloEmbedding?.trim()) {
        throw new TentativaIndexacaoInvalidaError(
          'resultado INDEXADO exige modeloEmbedding não vazio',
        );
      }
      if (props.motivoFalha !== undefined) {
        throw new TentativaIndexacaoInvalidaError(
          'resultado INDEXADO não pode vir acompanhado de motivoFalha',
        );
      }
      return new TentativaIndexacao('INDEXADO', props.timestamp, props.modeloEmbedding, undefined);
    }

    if (!props.motivoFalha?.trim()) {
      throw new TentativaIndexacaoInvalidaError(
        'resultado FALHA_TECNICA exige motivoFalha não vazio',
      );
    }
    if (props.modeloEmbedding !== undefined) {
      throw new TentativaIndexacaoInvalidaError(
        'resultado FALHA_TECNICA não pode vir acompanhado de modeloEmbedding',
      );
    }
    return new TentativaIndexacao('FALHA_TECNICA', props.timestamp, undefined, props.motivoFalha);
  }
}
