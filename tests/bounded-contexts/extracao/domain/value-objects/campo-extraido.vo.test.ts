import { describe, expect, it } from 'vitest';
import {
  CampoExtraido,
  CampoExtraidoInvalidoError,
} from '../../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';

describe('CampoExtraido', () => {
  it('extraido() produz extraido: true com o valor informado', () => {
    const campo = CampoExtraido.extraido('SKU-1', NivelConfianca.de(90), 'EXTRATOR');
    expect(campo.extraido).toBe(true);
    expect(campo.valor).toBe('SKU-1');
  });

  it('naoExtraido() SEMPRE produz valor: null — nunca inventa/estima valor (spec.md, Princípio IV)', () => {
    const campo = CampoExtraido.naoExtraido<string>(NivelConfianca.de(30), 'EXTRATOR');
    expect(campo.extraido).toBe(false);
    expect(campo.valor).toBeNull();
  });

  it('extraido: true ⟺ valor !== null — extraido() com valor nulo lança erro de domínio', () => {
    expect(() =>
      CampoExtraido.extraido(null as unknown as string, NivelConfianca.de(90), 'EXTRATOR'),
    ).toThrow(CampoExtraidoInvalidoError);
  });

  it('paraPayload() preserva a invariante extraido/valor no payload serializável', () => {
    const naoExtraido = CampoExtraido.naoExtraido<string>(
      NivelConfianca.de(30),
      'EXTRATOR',
    ).paraPayload();
    expect(naoExtraido).toEqual({
      valor: null,
      confianca: 30,
      extraido: false,
      agenteOrigem: 'EXTRATOR',
    });
  });
});
