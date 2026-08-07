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

describe('calcular — fases', () => {
  it('calcula o percentual de cada fase a partir das issues listadas no mapa', () => {
    const mapa: Mapa = {
      ...mapaVazio,
      fases: [
        { id: '2', titulo: 'Completar 005 e 003', status: 'em-andamento', issues: [10, 11, 12] },
        {
          id: '5',
          titulo: 'Validação com AWS real',
          status: 'pendente',
          nota: 'exige credencial AWS',
          issues: [20],
        },
      ],
    };
    const issues = [
      issue({ number: 10, state: 'CLOSED', closedAt: '2026-08-01T00:00:00Z' }),
      issue({ number: 11 }),
      issue({ number: 12 }),
      issue({ number: 20 }),
    ];

    const { fases } = calcular(issues, mapa, AGORA);

    expect(fases).toEqual([
      {
        id: '2',
        titulo: 'Completar 005 e 003',
        status: 'em-andamento',
        nota: undefined,
        total: 3,
        fechadas: 1,
        percentual: 33.3,
      },
      {
        id: '5',
        titulo: 'Validação com AWS real',
        status: 'pendente',
        nota: 'exige credencial AWS',
        total: 1,
        fechadas: 0,
        percentual: 0,
      },
    ]);
  });

  it('ignora número de issue do mapa que não existe mais no board', () => {
    const mapa: Mapa = {
      ...mapaVazio,
      fases: [{ id: '0', titulo: 'Fase 0', status: 'concluida', issues: [10, 999] }],
    };
    const issues = [issue({ number: 10, state: 'CLOSED', closedAt: '2026-08-01T00:00:00Z' })];

    const { fases } = calcular(issues, mapa, AGORA);

    expect(fases[0]?.total).toBe(1);
    expect(fases[0]?.percentual).toBe(100);
  });
});

describe('calcular — caminho crítico e deriva', () => {
  it('lista apenas as P1 ainda abertas, ordenadas por número', () => {
    const mapa: Mapa = { ...mapaVazio, prioridades: { P0: [], P1: [30, 20, 10], P2: [], P3: [] } };
    const issues = [
      issue({ number: 10, title: '[003] categorizar item' }),
      issue({ number: 20, title: '[005] decisao humana' }),
      issue({
        number: 30,
        title: '[005] ja fechada',
        state: 'CLOSED',
        closedAt: '2026-08-01T00:00:00Z',
      }),
    ];

    const { caminhoCritico } = calcular(issues, mapa, AGORA);

    expect(caminhoCritico).toEqual([
      {
        number: 10,
        title: '[003] categorizar item',
        url: 'https://github.com/labsitio/nexus-orc-back/issues/10',
        spec: '003',
      },
      {
        number: 20,
        title: '[005] decisao humana',
        url: 'https://github.com/labsitio/nexus-orc-back/issues/20',
        spec: '005',
      },
    ]);
  });

  it('conta as issues do mapa que já fecharam', () => {
    const mapa: Mapa = { ...mapaVazio, prioridades: { P0: [], P1: [10], P2: [20], P3: [] } };
    const issues = [
      issue({ number: 10, state: 'CLOSED', closedAt: '2026-08-01T00:00:00Z' }),
      issue({ number: 20, state: 'CLOSED', closedAt: '2026-08-02T00:00:00Z' }),
      issue({ number: 30 }),
    ];

    const { deriva } = calcular(issues, mapa, AGORA);

    expect(deriva.mapaJaFechadas).toBe(2);
  });

  it('reporta issue aberta que não está em nenhuma prioridade do mapa', () => {
    const mapa: Mapa = { ...mapaVazio, prioridades: { P0: [], P1: [10], P2: [], P3: [] } };
    const issues = [issue({ number: 10 }), issue({ number: 40, title: '[008] issue nova' })];

    const { deriva } = calcular(issues, mapa, AGORA);

    expect(deriva.naoMapeadas).toEqual([
      {
        number: 40,
        title: '[008] issue nova',
        url: 'https://github.com/labsitio/nexus-orc-back/issues/40',
        spec: '008',
      },
    ]);
  });

  it('repassa os riscos do mapa sem transformação', () => {
    const mapa: Mapa = { ...mapaVazio, riscos: ['risco A', 'risco B'] };

    expect(calcular([], mapa, AGORA).riscos).toEqual(['risco A', 'risco B']);
  });
});
