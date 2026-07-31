/**
 * Base de todo erro de domínio do módulo `shared-value-objects`.
 * Nunca capturado/silenciado pela Application — Princípio IV (constituição):
 * exceção de domínio sempre propaga até quem decide o que fazer com ela.
 */
export abstract class ErroDominio extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
