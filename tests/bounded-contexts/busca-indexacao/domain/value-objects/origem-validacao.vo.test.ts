import { describe, expect, it } from 'vitest';
import {
  OrigemValidacao,
  OrigemValidacaoInvalidaError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/origem-validacao.vo.js';

describe('OrigemValidacao', () => {
  it('aceita VALIDADO', () => {
    expect(OrigemValidacao.de('VALIDADO').valor).toBe('VALIDADO');
  });

  it('aceita VALIDADO_COM_RESSALVA', () => {
    expect(OrigemValidacao.de('VALIDADO_COM_RESSALVA').valor).toBe('VALIDADO_COM_RESSALVA');
  });

  it('rejeita qualquer outro valor', () => {
    expect(() => OrigemValidacao.de('PENDENTE')).toThrow(OrigemValidacaoInvalidaError);
    expect(() => OrigemValidacao.de('')).toThrow(OrigemValidacaoInvalidaError);
  });

  it('igual compara pelo valor, não por identidade de instância', () => {
    expect(OrigemValidacao.de('VALIDADO').igual(OrigemValidacao.de('VALIDADO'))).toBe(true);
    expect(OrigemValidacao.de('VALIDADO').igual(OrigemValidacao.de('VALIDADO_COM_RESSALVA'))).toBe(
      false,
    );
  });
});
