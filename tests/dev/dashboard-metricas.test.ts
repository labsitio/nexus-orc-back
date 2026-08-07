import { describe, expect, it } from 'vitest';
import { calcular, SEM_SPEC } from '../../src/dev/dashboard-metricas.js';
import type { Issue, Mapa } from '../../src/dev/dashboard-metricas.js';

/** Mapa curado mínimo — a Task 2 exercita fases e prioridades de verdade. */
const mapaVazio: Mapa = {
  gerado_de: 'fixture',
  fases: [],
  prioridades: { P0: [], P1: [], P2: [], P3: [] },
  riscos: [],
};

function issue(parcial: Partial<Issue> & Pick<Issue, 'number'>): Issue {
  return {
    title: `[001] titulo ${parcial.number}`,
    state: 'OPEN',
    closedAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    milestone: null,
    labels: [],
    url: `https://github.com/labsitio/nexus-orc-back/issues/${parcial.number}`,
    ...parcial,
  };
}

const AGORA = new Date('2026-08-06T12:00:00Z');

describe('calcular — resumo global', () => {
  it('conta abertas, fechadas e percentual com uma casa decimal', () => {
    const issues = [
      issue({ number: 1, state: 'CLOSED', closedAt: '2026-08-01T00:00:00Z' }),
      issue({ number: 2, state: 'CLOSED', closedAt: '2026-08-02T00:00:00Z' }),
      issue({ number: 3 }),
    ];

    const { global } = calcular(issues, mapaVazio, AGORA);

    expect(global.total).toBe(3);
    expect(global.fechadas).toBe(2);
    expect(global.abertas).toBe(1);
    expect(global.percentual).toBe(66.7);
  });

  it('conta labels de estado apenas nas issues abertas', () => {
    const issues = [
      issue({ number: 1, labels: [{ name: 'ready' }] }),
      issue({ number: 2, labels: [{ name: 'in-progress' }] }),
      issue({ number: 3, labels: [{ name: 'blocked' }] }),
      issue({
        number: 4,
        state: 'CLOSED',
        closedAt: '2026-08-01T00:00:00Z',
        labels: [{ name: 'ready' }],
      }),
    ];

    const { global } = calcular(issues, mapaVazio, AGORA);

    expect(global.ready).toBe(1);
    expect(global.emAndamento).toBe(1);
    expect(global.bloqueadas).toBe(1);
  });
});

describe('calcular — agrupamento por spec', () => {
  it('agrupa pelo prefixo [00X] do título', () => {
    const issues = [
      issue({ number: 1, title: '[001] upload multi-canal' }),
      issue({ number: 2, title: '[005] decisao humana' }),
      issue({
        number: 3,
        title: '[005] reenvio ao fornecedor',
        state: 'CLOSED',
        closedAt: '2026-08-01T00:00:00Z',
      }),
    ];

    const { specs } = calcular(issues, mapaVazio, AGORA);
    const spec005 = specs.find((s) => s.spec === '005');

    expect(spec005).toEqual({ spec: '005', abertas: 1, fechadas: 1, total: 2, percentual: 50 });
  });

  it('cai na milestone quando o título não tem prefixo', () => {
    const issues = [
      issue({
        number: 1,
        title: 'sem prefixo nenhum',
        milestone: { title: '004 · Indexação e Busca Semântica de Orçamentos' },
      }),
    ];

    const { specs } = calcular(issues, mapaVazio, AGORA);

    expect(specs.map((s) => s.spec)).toEqual(['004']);
  });

  it('cai no label spec-* quando não há prefixo nem milestone', () => {
    const issues = [
      issue({ number: 1, title: 'sem prefixo', labels: [{ name: 'bug' }, { name: 'spec-009' }] }),
    ];

    const { specs } = calcular(issues, mapaVazio, AGORA);

    expect(specs.map((s) => s.spec)).toEqual(['009']);
  });

  it('conta uma única vez a issue com mais de um label spec-*', () => {
    const issues = [
      issue({
        number: 656,
        title: '[007] isolamento estrutural em 002/003/005',
        labels: [{ name: 'spec-002' }, { name: 'spec-003' }, { name: 'spec-007' }],
      }),
    ];

    const { specs, global } = calcular(issues, mapaVazio, AGORA);

    expect(global.total).toBe(1);
    expect(specs).toHaveLength(1);
    expect(specs.map((s) => s.spec)).toEqual(['007']);
  });

  it('joga no bucket sem-spec o que não tem nenhuma das três marcas', () => {
    const issues = [issue({ number: 1, title: 'issue solta' })];

    const { specs } = calcular(issues, mapaVazio, AGORA);

    expect(specs.map((s) => s.spec)).toEqual([SEM_SPEC]);
  });

  it('ordena as specs por número, com sem-spec por último', () => {
    const issues = [
      issue({ number: 1, title: '[009] custo' }),
      issue({ number: 2, title: 'solta' }),
      issue({ number: 3, title: '[001] ingestao' }),
    ];

    const { specs } = calcular(issues, mapaVazio, AGORA);

    expect(specs.map((s) => s.spec)).toEqual(['001', '009', SEM_SPEC]);
  });
});
