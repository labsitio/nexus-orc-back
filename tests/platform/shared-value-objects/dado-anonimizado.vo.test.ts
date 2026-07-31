import { describe, expect, it } from 'vitest';
import {
  AplicadoEmInvalidoError,
  CampoOriginalInvalidoError,
  DadoAnonimizado,
  MetodoAnonimizacaoInvalidoError,
  SolicitacaoIdInvalidaError,
} from '../../../src/platform/shared-value-objects/domain/dado-anonimizado.vo.js';

const aplicadoEm = new Date('2026-07-31T00:00:00Z');

describe('DadoAnonimizado', () => {
  it('aceita props válidas com metodo MASCARAMENTO', () => {
    const dado = DadoAnonimizado.de({
      campoOriginal: 'email',
      metodo: 'MASCARAMENTO',
      aplicadoEm,
      solicitacaoId: 'solicitacao-1',
    });

    expect(dado.campoOriginal).toBe('email');
    expect(dado.metodo).toBe('MASCARAMENTO');
    expect(dado.aplicadoEm).toEqual(aplicadoEm);
    expect(dado.solicitacaoId).toBe('solicitacao-1');
  });

  it('aceita props válidas com metodo REMOCAO', () => {
    const dado = DadoAnonimizado.de({
      campoOriginal: 'telefone',
      metodo: 'REMOCAO',
      aplicadoEm,
      solicitacaoId: 'solicitacao-1',
    });

    expect(dado.metodo).toBe('REMOCAO');
  });

  it('nunca expõe getter de valor original — a API do VO só conhece o nome do campo, não o dado em si', () => {
    const dado = DadoAnonimizado.de({
      campoOriginal: 'email',
      metodo: 'MASCARAMENTO',
      aplicadoEm,
      solicitacaoId: 'solicitacao-1',
    });

    const chavesPublicas = Object.keys(dado);
    expect(chavesPublicas).toEqual(['campoOriginal', 'metodo', 'aplicadoEm', 'solicitacaoId']);
    expect(chavesPublicas).not.toContain('valor');
    expect(chavesPublicas).not.toContain('valorOriginal');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((dado as any).valorOriginal).toBeUndefined();
  });

  it.each(['', '   '])('rejeita campoOriginal vazio ou só espaços ("%s")', (campoOriginal) => {
    expect(() =>
      DadoAnonimizado.de({
        campoOriginal,
        metodo: 'MASCARAMENTO',
        aplicadoEm,
        solicitacaoId: 'solicitacao-1',
      }),
    ).toThrow(CampoOriginalInvalidoError);
  });

  it('rejeita metodo fora de MASCARAMENTO|REMOCAO', () => {
    expect(() =>
      DadoAnonimizado.de({
        campoOriginal: 'email',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metodo: 'CRIPTOGRAFIA' as any,
        aplicadoEm,
        solicitacaoId: 'solicitacao-1',
      }),
    ).toThrow(MetodoAnonimizacaoInvalidoError);
  });

  it('rejeita aplicadoEm inválida', () => {
    expect(() =>
      DadoAnonimizado.de({
        campoOriginal: 'email',
        metodo: 'MASCARAMENTO',
        aplicadoEm: new Date('data-invalida'),
        solicitacaoId: 'solicitacao-1',
      }),
    ).toThrow(AplicadoEmInvalidoError);
  });

  it.each(['', '   '])('rejeita solicitacaoId vazia ou só espaços ("%s")', (solicitacaoId) => {
    expect(() =>
      DadoAnonimizado.de({
        campoOriginal: 'email',
        metodo: 'MASCARAMENTO',
        aplicadoEm,
        solicitacaoId,
      }),
    ).toThrow(SolicitacaoIdInvalidaError);
  });

  it('equals compara por campoOriginal, metodo, aplicadoEm e solicitacaoId', () => {
    const a = DadoAnonimizado.de({
      campoOriginal: 'email',
      metodo: 'MASCARAMENTO',
      aplicadoEm,
      solicitacaoId: 'solicitacao-1',
    });
    const b = DadoAnonimizado.de({
      campoOriginal: 'email',
      metodo: 'MASCARAMENTO',
      aplicadoEm,
      solicitacaoId: 'solicitacao-1',
    });
    const c = DadoAnonimizado.de({
      campoOriginal: 'email',
      metodo: 'REMOCAO',
      aplicadoEm,
      solicitacaoId: 'solicitacao-1',
    });

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
