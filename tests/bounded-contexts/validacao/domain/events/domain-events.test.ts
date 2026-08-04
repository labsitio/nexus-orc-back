import { describe, expect, it } from 'vitest';
import { OrcamentoInconsistenciaDetectada } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.js';
import { OrcamentoValidadoComRessalva } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado-com-ressalva.event.js';
import { OrcamentoValidado } from '../../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado.event.js';

const orcamentoId = '018f4b1a-0000-7000-8000-000000000000';
const tenantId = '018f4b1a-tenant-0000-000000000000';
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
    criar: () => new OrcamentoValidado(orcamentoId, itens, condicoesComerciais, tenantId),
  },
  {
    nome: 'OrcamentoInconsistenciaDetectada',
    detailType: 'OrcamentoInconsistenciaDetectada',
    criar: () => new OrcamentoInconsistenciaDetectada(orcamentoId, inconsistencias, tenantId),
  },
  {
    nome: 'OrcamentoValidadoComRessalva',
    detailType: 'OrcamentoValidadoComRessalva',
    criar: () =>
      new OrcamentoValidadoComRessalva(
        orcamentoId,
        inconsistencias,
        itens,
        condicoesComerciais,
        tenantId,
      ),
  },
])('$nome', ({ detailType, criar }) => {
  it(`schemaVersion 2, orcamentoId, tenantId e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(2);
    expect(evento.orcamentoId).toBe(orcamentoId);
    expect(evento.tenantId).toBe(tenantId);
    expect(evento.detailType).toBe(detailType);
    expect(() => new Date(evento.ocorreuEm)).not.toThrow();
    expect(new Date(evento.ocorreuEm).toISOString()).toBe(evento.ocorreuEm);
  });
});

describe('OrcamentoInconsistenciaDetectada', () => {
  it('carrega a lista completa de inconsistências da tentativa atual', () => {
    const evento = new OrcamentoInconsistenciaDetectada(orcamentoId, inconsistencias, tenantId);
    expect(evento.inconsistencias).toEqual(inconsistencias);
  });
});

describe('OrcamentoValidado', () => {
  it('carrega itens e condicoesComerciais (ADR-003, spec 004/T006) para o BC Busca & Indexação montar ConteudoIndexavel', () => {
    const evento = new OrcamentoValidado(orcamentoId, itens, condicoesComerciais, tenantId);
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
      tenantId,
    );
    expect(evento.inconsistencias).toEqual(inconsistencias);
  });

  it('carrega itens e condicoesComerciais (ADR-003, spec 004/T006)', () => {
    const evento = new OrcamentoValidadoComRessalva(
      orcamentoId,
      inconsistencias,
      itens,
      condicoesComerciais,
      tenantId,
    );
    expect(evento.itens).toEqual(itens);
    expect(evento.condicoesComerciais).toBe(condicoesComerciais);
  });
});
