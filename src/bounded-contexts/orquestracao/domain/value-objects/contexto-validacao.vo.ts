import { ErroDominio } from '../errors/erro-dominio.js';

export const RESULTADOS_VALIDACAO = ['VALIDADO', 'VALIDADO_COM_RESSALVA'] as const;
export type ResultadoValidacao = (typeof RESULTADOS_VALIDACAO)[number];

export class ContextoValidacaoInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`ContextoValidacao inválido: ${mensagem}`);
  }
}

export interface InconsistenciaAceita {
  readonly regra: string;
  readonly detalhe: string;
}

export interface ContextoValidacaoParams {
  readonly resultado: ResultadoValidacao;
  readonly inconsistenciasAceitas?: readonly InconsistenciaAceita[];
}

/**
 * Cópia imutável traduzida do payload de `OrcamentoValidado`/
 * `OrcamentoValidadoComRessalva` (spec 003), criada exclusivamente pelo
 * `OrcamentoValidadoEventACL` — nunca referência viva ao agregado de
 * Validação (fronteira de Bounded Context, plan.md).
 * `inconsistenciasAceitas` (cópia local, não o VO `InconsistenciaDetectada`
 * de Validação) é exigido — não vazio — quando
 * `resultado === 'VALIDADO_COM_RESSALVA'`, para servir de fundamento a
 * `DecisaoRoteamento.motivoDadoAusente` quando aplicável.
 */
export class ContextoValidacao {
  private constructor(
    readonly resultado: ResultadoValidacao,
    readonly inconsistenciasAceitas: readonly InconsistenciaAceita[],
  ) {}

  static de(params: ContextoValidacaoParams): ContextoValidacao {
    const inconsistenciasAceitas = params.inconsistenciasAceitas ?? [];
    if (params.resultado === 'VALIDADO_COM_RESSALVA' && inconsistenciasAceitas.length === 0) {
      throw new ContextoValidacaoInvalidoError(
        'resultado "VALIDADO_COM_RESSALVA" exige ao menos uma inconsistência aceita',
      );
    }
    return new ContextoValidacao(params.resultado, inconsistenciasAceitas);
  }

  equals(outro: ContextoValidacao): boolean {
    return (
      this.resultado === outro.resultado &&
      this.inconsistenciasAceitas.length === outro.inconsistenciasAceitas.length &&
      this.inconsistenciasAceitas.every(
        (inconsistencia, indice) =>
          inconsistencia.regra === outro.inconsistenciasAceitas[indice]?.regra &&
          inconsistencia.detalhe === outro.inconsistenciasAceitas[indice]?.detalhe,
      )
    );
  }
}
