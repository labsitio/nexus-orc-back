import { describe, expect, it } from 'vitest';
import { OrcamentoInconsistenciaDetectada } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.js';
import { OrcamentoValidadoComRessalva } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado-com-ressalva.event.js';
import { OrcamentoValidado } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado.event.js';

const orcamentoId = '018f4b1a-0000-7000-8000-000000000000';
const inconsistencias = [
  { regra: 'CNPJ_INVALIDO' as const, detalhe: 'dígito verificador incorreto' },
];

describe.each([
  {
    nome: 'OrcamentoValidado',
    detailType: 'OrcamentoValidado',
    criar: () => new OrcamentoValidado(orcamentoId),
  },
  {
    nome: 'OrcamentoInconsistenciaDetectada',
    detailType: 'OrcamentoInconsistenciaDetectada',
    criar: () => new OrcamentoInconsistenciaDetectada(orcamentoId, inconsistencias),
  },
  {
    nome: 'OrcamentoValidadoComRessalva',
    detailType: 'OrcamentoValidadoComRessalva',
    criar: () => new OrcamentoValidadoComRessalva(orcamentoId, inconsistencias),
  },
])('$nome', ({ detailType, criar }) => {
  it(`schemaVersion 1, orcamentoId e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(1);
    expect(evento.orcamentoId).toBe(orcamentoId);
    expect(evento.detailType).toBe(detailType);
    expect(() => new Date(evento.ocorreuEm)).not.toThrow();
    expect(new Date(evento.ocorreuEm).toISOString()).toBe(evento.ocorreuEm);
  });
});

describe('OrcamentoInconsistenciaDetectada', () => {
  it('carrega a lista completa de inconsistências da tentativa atual', () => {
    const evento = new OrcamentoInconsistenciaDetectada(orcamentoId, inconsistencias);
    expect(evento.inconsistencias).toEqual(inconsistencias);
  });
});

describe('OrcamentoValidadoComRessalva', () => {
  it('carrega a lista de inconsistências aceitas com ressalva', () => {
    const evento = new OrcamentoValidadoComRessalva(orcamentoId, inconsistencias);
    expect(evento.inconsistencias).toEqual(inconsistencias);
  });
});
