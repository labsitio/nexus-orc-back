import { InconsistenciaDetectada } from './inconsistencia-detectada.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class TentativaValidacaoInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`TentativaValidacao inválida: ${mensagem}`);
  }
}

export type ResultadoTentativaValidacao = 'VALIDADO' | 'INCONSISTENTE' | 'ACEITE_COM_RESSALVA';

/**
 * Entrada de histórico imutável (append-only) de uma avaliação de regras de
 * consistência — nunca sobrescrita, apenas anexada ao agregado
 * `OrcamentoValidacao`.
 */
export class TentativaValidacao {
  private constructor(
    readonly resultado: ResultadoTentativaValidacao,
    readonly inconsistencias: readonly InconsistenciaDetectada[],
    readonly timestamp: Date,
  ) {}

  static de(
    resultado: ResultadoTentativaValidacao,
    inconsistencias: readonly InconsistenciaDetectada[],
    timestamp: Date,
  ): TentativaValidacao {
    if (resultado === 'INCONSISTENTE' && inconsistencias.length === 0) {
      throw new TentativaValidacaoInvalidaError(
        'resultado INCONSISTENTE exige ao menos uma inconsistência',
      );
    }
    if (resultado === 'VALIDADO' && inconsistencias.length > 0) {
      throw new TentativaValidacaoInvalidaError(
        'resultado VALIDADO não pode conter inconsistências',
      );
    }
    if (Number.isNaN(timestamp.getTime())) {
      throw new TentativaValidacaoInvalidaError('timestamp inválido');
    }
    return new TentativaValidacao(resultado, inconsistencias, timestamp);
  }
}
