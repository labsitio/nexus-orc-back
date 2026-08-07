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
    assignees: [],
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
        responsaveis: [],
      },
      {
        number: 20,
        title: '[005] decisao humana',
        url: 'https://github.com/labsitio/nexus-orc-back/issues/20',
        spec: '005',
        responsaveis: [],
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

  it('conta na deriva a issue fechada listada só numa fase, fora de qualquer prioridade', () => {
    const mapa: Mapa = {
      ...mapaVazio,
      fases: [{ id: '2', titulo: 'Fase 2', status: 'em-andamento', issues: [50] }],
    };
    const issues = [issue({ number: 50, state: 'CLOSED', closedAt: '2026-08-01T00:00:00Z' })];

    const { deriva } = calcular(issues, mapa, AGORA);

    expect(deriva.mapaJaFechadas).toBe(1);
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
        responsaveis: [],
      },
    ]);
  });

  it('não reporta como não mapeada uma issue aberta listada só numa fase', () => {
    const mapa: Mapa = {
      ...mapaVazio,
      fases: [{ id: '2', titulo: 'Fase 2', status: 'em-andamento', issues: [60] }],
    };
    const issues = [issue({ number: 60 })];

    const { deriva } = calcular(issues, mapa, AGORA);

    expect(deriva.naoMapeadas).toEqual([]);
  });

  it('repassa os riscos do mapa sem transformação', () => {
    const mapa: Mapa = { ...mapaVazio, riscos: ['risco A', 'risco B'] };

    expect(calcular([], mapa, AGORA).riscos).toEqual(['risco A', 'risco B']);
  });
});

describe('calcular — tarefas em andamento', () => {
  it('lista as abertas com label in-progress e seus responsáveis, ordenadas por número', () => {
    const issues = [
      issue({
        number: 30,
        title: '[005] decisao humana',
        labels: [{ name: 'in-progress' }],
        assignees: [{ login: 'allanrobert10' }],
      }),
      issue({
        number: 10,
        title: '[003] categorizar item',
        labels: [{ name: 'in-progress' }],
        assignees: [{ login: 'fulano' }, { login: 'ciclana' }],
      }),
      issue({ number: 20, labels: [{ name: 'ready' }] }),
    ];

    const { tarefasEmAndamento } = calcular(issues, mapaVazio, AGORA);

    expect(tarefasEmAndamento.map((t) => t.number)).toEqual([10, 30]);
    expect(tarefasEmAndamento[0]?.responsaveis).toEqual(['fulano', 'ciclana']);
    expect(tarefasEmAndamento[1]?.responsaveis).toEqual(['allanrobert10']);
  });

  it('inclui a issue reservada sem ninguém atribuído, com responsáveis vazio', () => {
    const issues = [issue({ number: 10, labels: [{ name: 'in-progress' }] })];

    const { tarefasEmAndamento } = calcular(issues, mapaVazio, AGORA);

    expect(tarefasEmAndamento).toHaveLength(1);
    expect(tarefasEmAndamento[0]?.responsaveis).toEqual([]);
  });

  it('separa bloqueadas de em andamento pelo label, sem misturar as duas listas', () => {
    const issues = [
      issue({ number: 688, title: '[ADR-010] T4', labels: [{ name: 'blocked' }] }),
      issue({ number: 689, title: '[ADR-010] T5', labels: [{ name: 'blocked' }] }),
      issue({ number: 250, labels: [{ name: 'in-progress' }] }),
    ];

    const { tarefasBloqueadas, tarefasEmAndamento } = calcular(issues, mapaVazio, AGORA);

    expect(tarefasBloqueadas.map((t) => t.number)).toEqual([688, 689]);
    expect(tarefasEmAndamento.map((t) => t.number)).toEqual([250]);
  });

  it('ignora issue fechada que ainda carrega o label blocked', () => {
    const issues = [
      issue({
        number: 688,
        state: 'CLOSED',
        closedAt: '2026-08-01T00:00:00Z',
        labels: [{ name: 'blocked' }],
      }),
    ];

    expect(calcular(issues, mapaVazio, AGORA).tarefasBloqueadas).toEqual([]);
  });

  it('ignora issue fechada que ainda carrega o label in-progress', () => {
    const issues = [
      issue({
        number: 10,
        state: 'CLOSED',
        closedAt: '2026-08-01T00:00:00Z',
        labels: [{ name: 'in-progress' }],
        assignees: [{ login: 'fulano' }],
      }),
    ];

    expect(calcular(issues, mapaVazio, AGORA).tarefasEmAndamento).toEqual([]);
  });
});

describe('calcular — fila por prioridade', () => {
  it('agrupa as abertas por faixa, ordenadas por número, ignorando as fechadas', () => {
    const mapa: Mapa = {
      ...mapaVazio,
      prioridades: { P0: [], P1: [30, 10], P2: [20], P3: [40] },
    };
    const issues = [
      issue({ number: 10, title: '[003] a' }),
      issue({ number: 20, title: '[005] b' }),
      issue({ number: 30, state: 'CLOSED', closedAt: '2026-08-01T00:00:00Z' }),
      issue({ number: 40, title: '[008] d' }),
    ];

    const { filaPorPrioridade } = calcular(issues, mapa, AGORA);
    const porTier = new Map(filaPorPrioridade.map((f) => [f.tier, f.itens.map((i) => i.number)]));

    expect(porTier.get('P0')).toEqual([]);
    expect(porTier.get('P1')).toEqual([10]);
    expect(porTier.get('P2')).toEqual([20]);
    expect(porTier.get('P3')).toEqual([40]);
  });

  it('conta a issue citada em duas faixas só na mais alta', () => {
    const mapa: Mapa = { ...mapaVazio, prioridades: { P0: [], P1: [10], P2: [10], P3: [10] } };
    const issues = [issue({ number: 10 })];

    const { filaPorPrioridade } = calcular(issues, mapa, AGORA);
    const total = filaPorPrioridade.reduce((s, f) => s + f.itens.length, 0);

    expect(total).toBe(1);
    expect(filaPorPrioridade.find((f) => f.tier === 'P1')?.itens.map((i) => i.number)).toEqual([
      10,
    ]);
    expect(filaPorPrioridade.find((f) => f.tier === 'P2')?.itens).toEqual([]);
  });

  it('devolve as quatro faixas mesmo quando vazias', () => {
    expect(calcular([], mapaVazio, AGORA).filaPorPrioridade.map((f) => f.tier)).toEqual([
      'P0',
      'P1',
      'P2',
      'P3',
    ]);
  });
});

describe('calcular — velocidade', () => {
  it('monta uma série de 14 dias terminando no dia de agora', () => {
    const { velocidade } = calcular([], mapaVazio, AGORA);

    expect(velocidade.serie).toHaveLength(14);
    expect(velocidade.serie.at(0)?.dia).toBe('2026-07-24');
    expect(velocidade.serie.at(-1)?.dia).toBe('2026-08-06');
  });

  it('conta as issues fechadas em cada dia da série', () => {
    const issues = [
      issue({ number: 1, state: 'CLOSED', closedAt: '2026-08-05T09:00:00Z' }),
      issue({ number: 2, state: 'CLOSED', closedAt: '2026-08-05T21:00:00Z' }),
      issue({ number: 3, state: 'CLOSED', closedAt: '2026-08-06T01:00:00Z' }),
    ];

    const { velocidade } = calcular(issues, mapaVazio, AGORA);

    expect(velocidade.serie.find((p) => p.dia === '2026-08-05')?.fechadas).toBe(2);
    expect(velocidade.serie.find((p) => p.dia === '2026-08-06')?.fechadas).toBe(1);
    expect(velocidade.serie.find((p) => p.dia === '2026-08-04')?.fechadas).toBe(0);
  });

  it('ignora fechamento anterior à janela de 14 dias na série, mas não na amostra', () => {
    const issues = [issue({ number: 1, state: 'CLOSED', closedAt: '2026-06-01T00:00:00Z' })];

    const { velocidade } = calcular(issues, mapaVazio, AGORA);

    // 66 dias inteiros e mais 12 horas entre 2026-06-01T00:00Z e AGORA — o ceil sobe para 67.
    expect(velocidade.serie.every((p) => p.fechadas === 0)).toBe(true);
    expect(velocidade.amostraDias).toBe(67);
  });

  it('projeta a partir da média móvel de 7 dias', () => {
    // 7 fechadas nos últimos 7 dias => média 1/dia; 3 abertas => 3 dias => 2026-08-09.
    const fechadas = ['08-06', '08-05', '08-04', '08-03', '08-02', '08-01', '07-31'].map(
      (dia, indice) =>
        issue({ number: indice + 1, state: 'CLOSED', closedAt: `2026-${dia}T10:00:00Z` }),
    );
    const abertas = [issue({ number: 101 }), issue({ number: 102 }), issue({ number: 103 })];

    const { velocidade } = calcular([...fechadas, ...abertas], mapaVazio, AGORA);

    expect(velocidade.mediaMovel7).toBe(1);
    expect(velocidade.diasRestantes).toBe(3);
    expect(velocidade.dataProjetada).toBe('2026-08-09');
  });

  it('suprime a projeção quando nada fechou nos últimos 7 dias', () => {
    const issues = [issue({ number: 1 }), issue({ number: 2 })];

    const { velocidade } = calcular(issues, mapaVazio, AGORA);

    expect(velocidade.mediaMovel7).toBe(0);
    expect(velocidade.diasRestantes).toBeNull();
    expect(velocidade.dataProjetada).toBeNull();
  });

  it('reporta amostra de 1 dia no mínimo, mesmo sem histórico', () => {
    expect(calcular([], mapaVazio, AGORA).velocidade.amostraDias).toBe(1);
  });
});
