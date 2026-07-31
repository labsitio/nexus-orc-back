import { describe, expect, it } from 'vitest';
import {
  ContextoValidacao,
  ContextoValidacaoInvalidoError,
} from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-validacao.vo.js';

describe('ContextoValidacao', () => {
  it('aceita resultado VALIDADO sem inconsistências aceitas', () => {
    const contexto = ContextoValidacao.de({ resultado: 'VALIDADO' });
    expect(contexto.resultado).toBe('VALIDADO');
    expect(contexto.inconsistenciasAceitas).toEqual([]);
  });

  it('aceita resultado VALIDADO_COM_RESSALVA com ao menos uma inconsistência aceita', () => {
    const contexto = ContextoValidacao.de({
      resultado: 'VALIDADO_COM_RESSALVA',
      inconsistenciasAceitas: [{ regra: 'PRAZO_INCOERENTE', detalhe: 'prazo maior que o usual' }],
    });
    expect(contexto.inconsistenciasAceitas).toHaveLength(1);
  });

  it('rejeita VALIDADO_COM_RESSALVA sem nenhuma inconsistência aceita', () => {
    expect(() => ContextoValidacao.de({ resultado: 'VALIDADO_COM_RESSALVA' })).toThrow(
      ContextoValidacaoInvalidoError,
    );
  });

  it('equals compara resultado e inconsistências aceitas', () => {
    const params = {
      resultado: 'VALIDADO_COM_RESSALVA' as const,
      inconsistenciasAceitas: [{ regra: 'PRAZO_INCOERENTE', detalhe: 'prazo maior que o usual' }],
    };
    expect(ContextoValidacao.de(params).equals(ContextoValidacao.de(params))).toBe(true);
    expect(
      ContextoValidacao.de(params).equals(
        ContextoValidacao.de({
          ...params,
          inconsistenciasAceitas: [{ regra: 'PRECO_FORA_DE_FAIXA', detalhe: 'preço acima da média' }],
        }),
      ),
    ).toBe(false);
  });
});
