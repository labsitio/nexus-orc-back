import { ErroDominio } from './errors/erro-dominio.js';

export const CATEGORIAS_DOCUMENTO_VALIDAS = ['ORCAMENTO_FORNECEDOR'] as const;

export type CategoriaDocumentoValor = (typeof CATEGORIAS_DOCUMENTO_VALIDAS)[number];

export class CategoriaDocumentoInvalidaError extends ErroDominio {
  constructor(valor: string) {
    super(
      `CategoriaDocumento inválida: "${valor}" — esperado um de ${CATEGORIAS_DOCUMENTO_VALIDAS.join(', ')}`,
    );
  }
}

/**
 * Taxonomia regulatória de categoria de documento — enum fechado, compartilhado
 * por todos os Bounded Contexts (ADR-004, spec-008). Novas categorias exigem
 * alteração de código: apenas o prazo de retenção por categoria (`PoliticaRetencao`)
 * é dado de configuração.
 */
export class CategoriaDocumento {
  private constructor(readonly valor: CategoriaDocumentoValor) {}

  static de(valor: string): CategoriaDocumento {
    if (!CATEGORIAS_DOCUMENTO_VALIDAS.includes(valor as CategoriaDocumentoValor)) {
      throw new CategoriaDocumentoInvalidaError(valor);
    }
    return new CategoriaDocumento(valor as CategoriaDocumentoValor);
  }

  equals(outra: CategoriaDocumento): boolean {
    return this.valor === outra.valor;
  }

  toString(): string {
    return this.valor;
  }
}
