import { describe, expect, it } from 'vitest';
import {
  ContextoExtracao,
  ContextoExtracaoInvalidoError,
} from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';

describe('ContextoExtracao', () => {
  it('aceita itensResumo e condicoesComerciaisResumo não vazios', () => {
    const contexto = ContextoExtracao.de({
      itensResumo: '3 itens, total R$ 1.200,00',
      condicoesComerciaisResumo: 'Pagamento em 30 dias',
      houvePendenciaConfirmada: false,
    });
    expect(contexto.itensResumo).toBe('3 itens, total R$ 1.200,00');
    expect(contexto.condicoesComerciaisResumo).toBe('Pagamento em 30 dias');
    expect(contexto.houvePendenciaConfirmada).toBe(false);
  });

  it('rejeita itensResumo vazio', () => {
    expect(() =>
      ContextoExtracao.de({
        itensResumo: '  ',
        condicoesComerciaisResumo: 'Pagamento em 30 dias',
        houvePendenciaConfirmada: false,
      }),
    ).toThrow(ContextoExtracaoInvalidoError);
  });

  it('rejeita condicoesComerciaisResumo vazio', () => {
    expect(() =>
      ContextoExtracao.de({
        itensResumo: '3 itens',
        condicoesComerciaisResumo: '',
        houvePendenciaConfirmada: false,
      }),
    ).toThrow(ContextoExtracaoInvalidoError);
  });

  it('equals compara pelos valores, incluindo houvePendenciaConfirmada', () => {
    const params = {
      itensResumo: '3 itens',
      condicoesComerciaisResumo: 'Pagamento em 30 dias',
      houvePendenciaConfirmada: true,
    };
    expect(ContextoExtracao.de(params).equals(ContextoExtracao.de(params))).toBe(true);
    expect(
      ContextoExtracao.de(params).equals(
        ContextoExtracao.de({ ...params, houvePendenciaConfirmada: false }),
      ),
    ).toBe(false);
  });
});
