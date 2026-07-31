/**
 * Base de todo erro de domínio do componente de plataforma Conformidade.
 * Nunca capturado/silenciado pela Application — Princípio IV (constituição):
 * exceção de domínio sempre propaga até quem decide o que fazer com ela.
 */
export abstract class ErroDominio extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
