import { ErroDominio } from '../errors/erro-dominio.js';

export class InconsistenciaDetectadaInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`InconsistenciaDetectada inválida: ${mensagem}`);
  }
}

export type RegraInconsistencia =
  | 'CNPJ_INVALIDO'
  | 'CNPJ_DIVERGENTE_CADASTRO'
  | 'CAMPO_OBRIGATORIO_AUSENTE'
  | 'PRECO_FORA_DE_FAIXA'
  | 'PRAZO_INCOERENTE';

export interface InconsistenciaDetectadaPayload {
  readonly regra: RegraInconsistencia;
  readonly referenciaItem?: string;
  readonly detalhe: string;
}

/**
 * Inconsistência de negócio identificada por uma das 4 regras determinísticas.
 * `detalhe` MUST ser texto legível e específico (nunca "inconsistente"
 * genérico) — critério de aceite spec.md "identifica especificamente qual
 * regra falhou".
 */
export class InconsistenciaDetectada {
  private constructor(
    readonly regra: RegraInconsistencia,
    readonly detalhe: string,
    readonly referenciaItem?: string,
  ) {}

  static de(
    regra: RegraInconsistencia,
    detalhe: string,
    referenciaItem?: string,
  ): InconsistenciaDetectada {
    if (!detalhe.trim()) {
      throw new InconsistenciaDetectadaInvalidaError('detalhe não pode ser vazio');
    }
    return new InconsistenciaDetectada(regra, detalhe.trim(), referenciaItem);
  }

  paraPayload(): InconsistenciaDetectadaPayload {
    return {
      regra: this.regra,
      detalhe: this.detalhe,
      ...(this.referenciaItem !== undefined ? { referenciaItem: this.referenciaItem } : {}),
    };
  }
}
