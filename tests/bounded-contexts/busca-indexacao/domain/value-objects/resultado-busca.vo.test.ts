import { describe, expect, it } from 'vitest';
import {
  ResultadoBusca,
  ResultadoBuscaInvalidoError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/resultado-busca.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';

const ORCAMENTO_ID = '01890a5d-ac96-774b-bcce-b3f9c9f9f9f9';

describe('ResultadoBusca', () => {
  it('aceita scoreRelevancia dentro de [0, 1] e trechoDestacado opcional', () => {
    const resultado = ResultadoBusca.de({
      orcamentoId: OrcamentoId.de(ORCAMENTO_ID),
      scoreRelevancia: 0.87,
      trechoDestacado: 'material elétrico...',
    });
    expect(resultado.scoreRelevancia).toBe(0.87);
    expect(resultado.trechoDestacado).toBe('material elétrico...');
  });

  it('aceita ausência de trechoDestacado', () => {
    const resultado = ResultadoBusca.de({
      orcamentoId: OrcamentoId.de(ORCAMENTO_ID),
      scoreRelevancia: 1,
    });
    expect(resultado.trechoDestacado).toBeUndefined();
  });

  it.each([-0.01, 1.01, Number.NaN])('rejeita scoreRelevancia fora de [0, 1]: %s', (score) => {
    expect(() =>
      ResultadoBusca.de({ orcamentoId: OrcamentoId.de(ORCAMENTO_ID), scoreRelevancia: score }),
    ).toThrow(ResultadoBuscaInvalidoError);
  });

  it('aceita os limites 0 e 1', () => {
    expect(
      ResultadoBusca.de({ orcamentoId: OrcamentoId.de(ORCAMENTO_ID), scoreRelevancia: 0 })
        .scoreRelevancia,
    ).toBe(0);
    expect(
      ResultadoBusca.de({ orcamentoId: OrcamentoId.de(ORCAMENTO_ID), scoreRelevancia: 1 })
        .scoreRelevancia,
    ).toBe(1);
  });
});
