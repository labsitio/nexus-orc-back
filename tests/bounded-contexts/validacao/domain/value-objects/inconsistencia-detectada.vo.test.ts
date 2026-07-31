import { describe, expect, it } from 'vitest';
import {
  InconsistenciaDetectada,
  InconsistenciaDetectadaInvalidaError,
} from '../../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';

describe('InconsistenciaDetectada', () => {
  it('aceita regra + detalhe legível, sem referenciaItem', () => {
    const inconsistencia = InconsistenciaDetectada.de(
      'CNPJ_INVALIDO',
      'dígito verificador incorreto',
    );
    expect(inconsistencia.paraPayload()).toEqual({
      regra: 'CNPJ_INVALIDO',
      detalhe: 'dígito verificador incorreto',
    });
  });

  it('aceita referenciaItem quando a regra é por item', () => {
    const inconsistencia = InconsistenciaDetectada.de(
      'PRECO_FORA_DE_FAIXA',
      'preço unitário acima da faixa da categoria Informática',
      'item-2',
    );
    expect(inconsistencia.paraPayload()).toEqual({
      regra: 'PRECO_FORA_DE_FAIXA',
      detalhe: 'preço unitário acima da faixa da categoria Informática',
      referenciaItem: 'item-2',
    });
  });

  it('rejeita detalhe vazio', () => {
    expect(() => InconsistenciaDetectada.de('PRAZO_INCOERENTE', '   ')).toThrow(
      InconsistenciaDetectadaInvalidaError,
    );
  });
});
