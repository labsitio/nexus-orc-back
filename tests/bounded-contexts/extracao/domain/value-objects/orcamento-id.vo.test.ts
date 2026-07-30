import { describe, expect, it } from 'vitest';
import {
  OrcamentoId,
  OrcamentoIdInvalidoError,
} from '../../../../../src/bounded-contexts/extracao/domain/value-objects/orcamento-id.vo.js';

describe('OrcamentoId', () => {
  it('aceita UUID v7 válido e reutiliza o mesmo valor (nunca gera um novo)', () => {
    const valor = '01890a5d-ac96-774b-bcce-b302099a8057';
    expect(OrcamentoId.de(valor).toString()).toBe(valor);
  });

  it('rejeita valor que não é UUID v7', () => {
    expect(() => OrcamentoId.de('não-é-um-uuid')).toThrow(OrcamentoIdInvalidoError);
  });

  it('equals compara pelo valor', () => {
    const valor = '01890a5d-ac96-774b-bcce-b302099a8057';
    expect(OrcamentoId.de(valor).equals(OrcamentoId.de(valor))).toBe(true);
  });
});
