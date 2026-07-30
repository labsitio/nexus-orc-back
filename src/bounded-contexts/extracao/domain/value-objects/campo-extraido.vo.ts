import { ErroDominio } from '../errors/erro-dominio.js';
import { NivelConfianca } from './nivel-confianca.vo.js';

export const AGENTES_ORIGEM_CAMPO = ['EXTRATOR', 'HUMANO'] as const;
export type AgenteOrigemCampo = (typeof AGENTES_ORIGEM_CAMPO)[number];

export class CampoExtraidoInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`CampoExtraido inválido: ${mensagem}`);
  }
}

/** Payload serializável de `CampoExtraido<T>` — usado nos Domain Events. */
export interface CampoExtraidoPayload<T> {
  readonly valor: T | null;
  readonly confianca: number;
  readonly extraido: boolean;
  readonly agenteOrigem: AgenteOrigemCampo;
}

/**
 * VO genérico de todo campo extraído do orçamento (spec.md "Ação proibida
 * crítica": nunca inventar/estimar valor). Estruturalmente impossível marcar
 * `extraido: true` sem `valor`, ou `extraido: false` com `valor` preenchido —
 * o construtor garante `extraido === false ⟺ valor === null`.
 */
export class CampoExtraido<T> {
  private constructor(
    readonly valor: T | null,
    readonly confianca: NivelConfianca,
    readonly extraido: boolean,
    readonly agenteOrigem: AgenteOrigemCampo,
  ) {}

  static extraido<T>(
    valor: T,
    confianca: NivelConfianca,
    agenteOrigem: AgenteOrigemCampo,
  ): CampoExtraido<T> {
    if (valor === null || valor === undefined) {
      throw new CampoExtraidoInvalidoError('extraido: true exige valor não nulo');
    }
    return new CampoExtraido(valor, confianca, true, agenteOrigem);
  }

  static naoExtraido<T>(
    confianca: NivelConfianca,
    agenteOrigem: AgenteOrigemCampo,
  ): CampoExtraido<T> {
    return new CampoExtraido<T>(null, confianca, false, agenteOrigem);
  }

  paraPayload(): CampoExtraidoPayload<T> {
    return {
      valor: this.valor,
      confianca: this.confianca.valor,
      extraido: this.extraido,
      agenteOrigem: this.agenteOrigem,
    };
  }
}
