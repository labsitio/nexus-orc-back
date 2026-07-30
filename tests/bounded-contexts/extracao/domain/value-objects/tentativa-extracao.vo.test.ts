import { describe, expect, it } from 'vitest';
import {
  TentativaExtracao,
  TentativaExtracaoInvalidaError,
} from '../../../../../src/bounded-contexts/extracao/domain/value-objects/tentativa-extracao.vo.js';

describe('TentativaExtracao', () => {
  it('sucesso() registra agente e resultado', () => {
    const tentativa = TentativaExtracao.sucesso('EXTRATOR', 'EXTRAIDO');
    expect(tentativa.agente).toBe('EXTRATOR');
    expect(tentativa.resultado).toBe('EXTRAIDO');
    expect(tentativa.motivoInsucesso).toBeUndefined();
  });

  it('insucesso() registra agente e motivoInsucesso', () => {
    const tentativa = TentativaExtracao.insucesso(
      'EXTRATOR',
      '1+ campo obrigatório sem confiança suficiente',
    );
    expect(tentativa.motivoInsucesso).toBe('1+ campo obrigatório sem confiança suficiente');
    expect(tentativa.resultado).toBeUndefined();
  });

  it('rejeita motivoInsucesso vazio', () => {
    expect(() => TentativaExtracao.insucesso('EXTRATOR', '  ')).toThrow(
      TentativaExtracaoInvalidaError,
    );
  });
});
