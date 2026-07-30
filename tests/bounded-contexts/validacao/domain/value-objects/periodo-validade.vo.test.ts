import { describe, expect, it } from 'vitest';
import {
  PeriodoValidade,
  PeriodoValidadeInvalidoError,
} from '../../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';

describe('PeriodoValidade', () => {
  it('aceita data válida e serializa em ISO 8601', () => {
    const data = new Date('2026-12-31T00:00:00.000Z');
    expect(PeriodoValidade.de(data).paraPayload()).toBe(data.toISOString());
  });

  it('rejeita data inválida', () => {
    expect(() => PeriodoValidade.de(new Date('data-invalida'))).toThrow(
      PeriodoValidadeInvalidoError,
    );
  });
});
