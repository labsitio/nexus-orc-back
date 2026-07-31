import { describe, expect, it } from 'vitest';
import { CategoriaDocumento } from '../../../src/platform/shared-value-objects/domain/categoria-documento.vo.js';
import {
  AtualizadaEmInvalidaError,
  BaseLegalInvalidaError,
  PoliticaRetencao,
  PrazoEmDiasInvalidoError,
} from '../../../src/platform/shared-value-objects/domain/politica-retencao.vo.js';

const categoria = CategoriaDocumento.de('ORCAMENTO_FORNECEDOR');
const atualizadaEm = new Date('2026-07-31T00:00:00Z');

describe('PoliticaRetencao', () => {
  it('aceita prazoEmDias positivo', () => {
    const politica = PoliticaRetencao.de({
      categoria,
      prazoEmDias: 365,
      baseLegal: 'LGPD art. 16',
      atualizadaEm,
    });

    expect(politica.prazoEmDias).toBe(365);
    expect(politica.categoria.equals(categoria)).toBe(true);
    expect(politica.baseLegal).toBe('LGPD art. 16');
    expect(politica.atualizadaEm).toEqual(atualizadaEm);
  });

  it.each([0, -1, -100])('rejeita prazoEmDias não positivo (%i)', (prazoEmDias) => {
    expect(() =>
      PoliticaRetencao.de({ categoria, prazoEmDias, baseLegal: 'LGPD art. 16', atualizadaEm }),
    ).toThrow(PrazoEmDiasInvalidoError);
  });

  it('rejeita prazoEmDias não inteiro', () => {
    expect(() =>
      PoliticaRetencao.de({ categoria, prazoEmDias: 1.5, baseLegal: 'LGPD art. 16', atualizadaEm }),
    ).toThrow(PrazoEmDiasInvalidoError);
  });

  it.each(['', '   '])('rejeita baseLegal vazia ou só espaços ("%s")', (baseLegal) => {
    expect(() =>
      PoliticaRetencao.de({ categoria, prazoEmDias: 365, baseLegal, atualizadaEm }),
    ).toThrow(BaseLegalInvalidaError);
  });

  it('rejeita atualizadaEm inválida', () => {
    expect(() =>
      PoliticaRetencao.de({
        categoria,
        prazoEmDias: 365,
        baseLegal: 'LGPD art. 16',
        atualizadaEm: new Date('data-invalida'),
      }),
    ).toThrow(AtualizadaEmInvalidaError);
  });

  it('equals compara por categoria, prazoEmDias, baseLegal e atualizadaEm', () => {
    const a = PoliticaRetencao.de({
      categoria,
      prazoEmDias: 365,
      baseLegal: 'LGPD art. 16',
      atualizadaEm,
    });
    const b = PoliticaRetencao.de({
      categoria,
      prazoEmDias: 365,
      baseLegal: 'LGPD art. 16',
      atualizadaEm,
    });
    const c = PoliticaRetencao.de({
      categoria,
      prazoEmDias: 90,
      baseLegal: 'LGPD art. 16',
      atualizadaEm,
    });

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
