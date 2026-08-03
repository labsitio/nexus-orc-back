import { describe, expect, it } from 'vitest';
import { OrcamentoInconsistenciaDetectada } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.js';
import { OrcamentoValidadoComRessalva } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado-com-ressalva.event.js';
import { OrcamentoValidado } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado.event.js';

const orcamentoId = '018f4b1a-0000-7000-8000-000000000000';
const inconsistencias = [
  { regra: 'CNPJ_INVALIDO' as const, detalhe: 'dígito verificador incorreto' },
];

const itens = [
  {
    descricao: 'Caixa de papelão ondulado 40x30x20',
    quantidade: 500,
    precoUnitario: { valorCentavos: 32000, moeda: 'BRL' },
    extraido: true,
  },
];
const condicoesComerciais = '30/60/90 dias';

describe.each([
  {
    nome: 'OrcamentoValidado',
    detailType: 'OrcamentoValidado',
    schemaVersion: 2,
    criar: () => new OrcamentoValidado(orcamentoId, itens, condicoesComerciais),
  },
  {
    nome: 'OrcamentoInconsistenciaDetectada',
    detailType: 'OrcamentoInconsistenciaDetectada',
    schemaVersion: 1,
    criar: () => new OrcamentoInconsistenciaDetectada(orcamentoId, inconsistencias),
  },
  {
    nome: 'OrcamentoValidadoComRessalva',
    detailType: 'OrcamentoValidadoComRessalva',
    schemaVersion: 2,
    criar: () =>
      new OrcamentoValidadoComRessalva(orcamentoId, inconsistencias, itens, condicoesComerciais),
  },
])('$nome', ({ detailType, schemaVersion, criar }) => {
  it(`schemaVersion ${schemaVersion}, orcamentoId e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(schemaVersion);
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

describe('OrcamentoValidado', () => {
  it('carrega itens e condicoesComerciais (ADR-003, spec 004/T006) para o BC Busca & Indexação montar ConteudoIndexavel', () => {
    const evento = new OrcamentoValidado(orcamentoId, itens, condicoesComerciais);
    expect(evento.itens).toEqual(itens);
    expect(evento.condicoesComerciais).toBe(condicoesComerciais);
  });
});

describe('OrcamentoValidadoComRessalva', () => {
  it('carrega a lista de inconsistências aceitas com ressalva', () => {
    const evento = new OrcamentoValidadoComRessalva(
      orcamentoId,
      inconsistencias,
      itens,
      condicoesComerciais,
    );
    expect(evento.inconsistencias).toEqual(inconsistencias);
  });

  it('carrega itens e condicoesComerciais (ADR-003, spec 004/T006)', () => {
    const evento = new OrcamentoValidadoComRessalva(
      orcamentoId,
      inconsistencias,
      itens,
      condicoesComerciais,
    );
    expect(evento.itens).toEqual(itens);
    expect(evento.condicoesComerciais).toBe(condicoesComerciais);
  });
});
