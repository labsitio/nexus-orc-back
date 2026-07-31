import { ErroDominio } from '../errors/erro-dominio.js';

export class ContextoClassificacaoInvalidoError extends ErroDominio {
  constructor(campo: string) {
    super(`ContextoClassificacao inválido: "${campo}" não pode ser vazio`);
  }
}

export interface ContextoClassificacaoParams {
  readonly fornecedorIdentificado: string;
  readonly formatoIdentificado: string;
}

/**
 * Cópia imutável traduzida do payload do evento `OrcamentoClassificado`
 * (spec 001), criada exclusivamente pelo `OrcamentoClassificadoEventACL`
 * — nunca referência viva ao agregado de Ingestão & Identificação
 * (fronteira de Bounded Context, plan.md).
 */
export class ContextoClassificacao {
  private constructor(
    readonly fornecedorIdentificado: string,
    readonly formatoIdentificado: string,
  ) {}

  static de(params: ContextoClassificacaoParams): ContextoClassificacao {
    if (!params.fornecedorIdentificado.trim()) {
      throw new ContextoClassificacaoInvalidoError('fornecedorIdentificado');
    }
    if (!params.formatoIdentificado.trim()) {
      throw new ContextoClassificacaoInvalidoError('formatoIdentificado');
    }
    return new ContextoClassificacao(
      params.fornecedorIdentificado.trim(),
      params.formatoIdentificado.trim(),
    );
  }

  equals(outro: ContextoClassificacao): boolean {
    return (
      this.fornecedorIdentificado === outro.fornecedorIdentificado &&
      this.formatoIdentificado === outro.formatoIdentificado
    );
  }
}
