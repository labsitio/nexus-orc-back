import { ErroDominio } from "../errors/erro-dominio.js";
import type { AgenteOrigem } from "./resultado-classificacao.vo.js";
import { ResultadoClassificacao } from "./resultado-classificacao.vo.js";

export class TentativaClassificacaoInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`TentativaClassificacao inválida: ${mensagem}`);
  }
}

/**
 * Entrada de histórico imutável do agregado `Orcamento` — append-only, nunca editada.
 * Registra sucesso (resultado) ou insucesso (motivo) de uma tentativa de classificação.
 */
export class TentativaClassificacao {
  private constructor(
    readonly agente: AgenteOrigem,
    readonly timestamp: Date,
    readonly resultado?: ResultadoClassificacao,
    readonly motivoInsucesso?: string,
  ) {}

  static sucesso(
    agente: AgenteOrigem,
    resultado: ResultadoClassificacao,
    timestamp: Date = new Date(),
  ): TentativaClassificacao {
    return new TentativaClassificacao(agente, timestamp, resultado, undefined);
  }

  static insucesso(
    agente: AgenteOrigem,
    motivoInsucesso: string,
    timestamp: Date = new Date(),
  ): TentativaClassificacao {
    if (!motivoInsucesso.trim()) {
      throw new TentativaClassificacaoInvalidaError(
        "motivoInsucesso não pode ser vazio",
      );
    }
    return new TentativaClassificacao(
      agente,
      timestamp,
      undefined,
      motivoInsucesso,
    );
  }
}
