import { ErroDominio } from '../errors/erro-dominio.js';

export const AGENTES_ORIGEM_CLASSIFICACAO = ['CLASSIFICADOR', 'HUMANO'] as const;
export type AgenteOrigemClassificacao = (typeof AGENTES_ORIGEM_CLASSIFICACAO)[number];

export class ReferenciaClassificacaoInvalidaError extends ErroDominio {
  constructor(campo: string) {
    super(`ReferenciaClassificacao inválida: "${campo}" não pode ser vazio`);
  }
}

export interface ReferenciaClassificacaoParams {
  readonly fornecedorIdentificado: string;
  readonly formatoIdentificado: string;
  readonly agenteOrigem: AgenteOrigemClassificacao;
}

/**
 * Cópia imutável do resultado de classificação (payload do evento
 * `OrcamentoClassificado`, spec 001) no momento da criação do agregado
 * `ExtracaoOrcamento` — nunca sobrescrita depois (plan.md).
 */
export class ReferenciaClassificacao {
  private constructor(
    readonly fornecedorIdentificado: string,
    readonly formatoIdentificado: string,
    readonly agenteOrigem: AgenteOrigemClassificacao,
  ) {}

  static de(params: ReferenciaClassificacaoParams): ReferenciaClassificacao {
    if (!params.fornecedorIdentificado.trim()) {
      throw new ReferenciaClassificacaoInvalidaError('fornecedorIdentificado');
    }
    if (!params.formatoIdentificado.trim()) {
      throw new ReferenciaClassificacaoInvalidaError('formatoIdentificado');
    }
    return new ReferenciaClassificacao(
      params.fornecedorIdentificado,
      params.formatoIdentificado,
      params.agenteOrigem,
    );
  }

  equals(outra: ReferenciaClassificacao): boolean {
    return (
      this.fornecedorIdentificado === outra.fornecedorIdentificado &&
      this.formatoIdentificado === outra.formatoIdentificado &&
      this.agenteOrigem === outra.agenteOrigem
    );
  }
}
