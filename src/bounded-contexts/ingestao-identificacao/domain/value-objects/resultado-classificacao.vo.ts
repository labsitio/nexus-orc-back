import { ErroDominio } from "../errors/erro-dominio.js";
import { NivelConfianca } from "./nivel-confianca.vo.js";

export const AGENTES_ORIGEM = ["CLASSIFICADOR", "HUMANO"] as const;
export type AgenteOrigem = (typeof AGENTES_ORIGEM)[number];

export class ResultadoClassificacaoInvalidoError extends ErroDominio {
  constructor(campo: string) {
    super(`ResultadoClassificacao inválido: "${campo}" não pode ser vazio`);
  }
}

/** Payload serializável do resultado — usado nos Domain Events, nunca a VO em si (fronteira de contexto). */
export interface ResultadoClassificacaoPayload {
  readonly fornecedorIdentificado: string;
  readonly formatoIdentificado: string;
  readonly nivelConfianca: number;
  readonly agenteOrigem: AgenteOrigem;
}

export interface ResultadoClassificacaoParams {
  readonly fornecedorIdentificado: string;
  readonly formatoIdentificado: string;
  readonly nivelConfianca: NivelConfianca;
  readonly agenteOrigem: AgenteOrigem;
}

export class ResultadoClassificacao {
  private constructor(
    readonly fornecedorIdentificado: string,
    readonly formatoIdentificado: string,
    readonly nivelConfianca: NivelConfianca,
    readonly agenteOrigem: AgenteOrigem,
  ) {}

  static criar(params: ResultadoClassificacaoParams): ResultadoClassificacao {
    if (!params.fornecedorIdentificado.trim()) {
      throw new ResultadoClassificacaoInvalidoError("fornecedorIdentificado");
    }
    if (!params.formatoIdentificado.trim()) {
      throw new ResultadoClassificacaoInvalidoError("formatoIdentificado");
    }
    return new ResultadoClassificacao(
      params.fornecedorIdentificado,
      params.formatoIdentificado,
      params.nivelConfianca,
      params.agenteOrigem,
    );
  }

  paraPayload(): ResultadoClassificacaoPayload {
    return {
      fornecedorIdentificado: this.fornecedorIdentificado,
      formatoIdentificado: this.formatoIdentificado,
      nivelConfianca: this.nivelConfianca.valor,
      agenteOrigem: this.agenteOrigem,
    };
  }
}
