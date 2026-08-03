import { InconsistenciaDetectada } from './inconsistencia-detectada.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class TentativaValidacaoInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`TentativaValidacao inválida: ${mensagem}`);
  }
}

export const RESULTADOS_TENTATIVA_VALIDACAO = [
  'VALIDADO',
  'INCONSISTENTE',
  'ACEITE_COM_RESSALVA',
] as const;
export type ResultadoTentativaValidacao = (typeof RESULTADOS_TENTATIVA_VALIDACAO)[number];

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
    /**
     * Justificativa textual da decisão humana que originou esta tentativa
     * (T036/#146) — `undefined` para tentativas automáticas (`ValidarOrcamento`,
     * sem intervenção humana ainda). Nunca obrigatória aqui: a regra de borda
     * "justificativa obrigatória no request" já é validação de Interface
     * (Zod, `decisao-humana.schema.ts`), este VO só carrega o valor.
     */
    readonly justificativa?: string,
  ) {}

  static de(
    resultado: ResultadoTentativaValidacao,
    inconsistencias: readonly InconsistenciaDetectada[],
    timestamp: Date,
    justificativa?: string,
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
    return new TentativaValidacao(resultado, inconsistencias, timestamp, justificativa);
  }
}
