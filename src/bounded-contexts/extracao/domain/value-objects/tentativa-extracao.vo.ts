import { ErroDominio } from '../errors/erro-dominio.js';
import type { AgenteOrigemCampo } from './campo-extraido.vo.js';

export class TentativaExtracaoInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`TentativaExtracao inválida: ${mensagem}`);
  }
}

/**
 * Entrada de histórico imutável do agregado `ExtracaoOrcamento` — append-only,
 * nunca editada. Registra sucesso (`resultado`) ou insucesso
 * (`motivoInsucesso`, ex.: "1+ campo obrigatório sem confiança") de uma
 * tentativa de extração ou de confirmação humana.
 */
export class TentativaExtracao {
  private constructor(
    readonly agente: AgenteOrigemCampo,
    readonly timestamp: Date,
    readonly resultado?: string,
    readonly motivoInsucesso?: string,
  ) {}

  static sucesso(
    agente: AgenteOrigemCampo,
    resultado: string,
    timestamp: Date = new Date(),
  ): TentativaExtracao {
    if (!resultado.trim()) {
      throw new TentativaExtracaoInvalidaError('resultado não pode ser vazio');
    }
    return new TentativaExtracao(agente, timestamp, resultado, undefined);
  }

  static insucesso(
    agente: AgenteOrigemCampo,
    motivoInsucesso: string,
    timestamp: Date = new Date(),
  ): TentativaExtracao {
    if (!motivoInsucesso.trim()) {
      throw new TentativaExtracaoInvalidaError('motivoInsucesso não pode ser vazio');
    }
    return new TentativaExtracao(agente, timestamp, undefined, motivoInsucesso);
  }
}
