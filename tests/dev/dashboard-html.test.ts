import { describe, expect, it } from 'vitest';
import { renderizar, renderizarParaImpressao } from '../../src/dev/dashboard-html.js';
import type {
  FaseMetrica,
  ItemIssue,
  Metricas,
  SpecMetrica,
} from '../../src/dev/dashboard-metricas.js';

function item(parcial: Partial<ItemIssue> & Pick<ItemIssue, 'number'>): ItemIssue {
  return {
    title: `titulo ${parcial.number}`,
    url: `https://github.com/labsitio/nexus-orc-back/issues/${parcial.number}`,
    spec: '001',
    responsaveis: [],
    ...parcial,
  };
}

function fase(parcial: Partial<FaseMetrica> & Pick<FaseMetrica, 'id'>): FaseMetrica {
  return {
    titulo: `Fase ${parcial.id}`,
    status: 'em-andamento',
    nota: undefined,
    total: 5,
    fechadas: 2,
    percentual: 40,
    ...parcial,
  };
}

const SPEC_PADRAO: SpecMetrica = {
  spec: '001',
  abertas: 3,
  fechadas: 2,
  total: 5,
  percentual: 40,
};

/** `Metricas` completa com valores plausíveis — cada teste sobrescreve só o que importa. */
function metricas(parcial: Partial<Metricas> = {}): Metricas {
  return {
    geradoEm: '2026-08-06T12:00:00.000Z',
    geradoDe: 'docs/dashboard-mapa.json',
    global: {
      total: 10,
      fechadas: 4,
      abertas: 6,
      percentual: 40,
      ready: 2,
      emAndamento: 1,
      bloqueadas: 1,
    },
    specs: [SPEC_PADRAO],
    fases: [fase({ id: '1' })],
    caminhoCritico: [item({ number: 10 })],
    tarefasEmAndamento: [],
    tarefasBloqueadas: [],
    filaPorPrioridade: [
      { tier: 'P0', itens: [] },
      { tier: 'P1', itens: [item({ number: 10 })] },
      { tier: 'P2', itens: [] },
      { tier: 'P3', itens: [] },
    ],
    deriva: { mapaJaFechadas: 3, naoMapeadas: [item({ number: 20 })] },
    velocidade: {
      serie: [
        { dia: '2026-08-05', fechadas: 1 },
        { dia: '2026-08-06', fechadas: 2 },
      ],
      mediaMovel7: 1.2,
      amostraDias: 10,
      diasRestantes: 5,
      dataProjetada: '2026-08-11',
    },
    riscos: ['risco A'],
    ...parcial,
  };
}

describe('renderizar — caminho crítico', () => {
  it('mostra a mensagem de vazio e nenhuma tabela quando não há P1 aberta', () => {
    // Fila zerada para a contagem de tabelas isolar o caminho crítico:
    // a seção de prioridades também emite tabela.
    const html = renderizar(
      metricas({
        caminhoCritico: [],
        filaPorPrioridade: [
          { tier: 'P0', itens: [] },
          { tier: 'P1', itens: [] },
          { tier: 'P2', itens: [] },
          { tier: 'P3', itens: [] },
        ],
      }),
    );

    expect(html).toContain('Nenhuma P1 aberta.');
    // Única tabela restante na página é a da seção de deriva.
    expect(html.match(/<table>/g)).toHaveLength(1);
  });
});

describe('renderizar — deriva', () => {
  it('mostra a mensagem de vazio quando não há issue aberta fora do mapa', () => {
    const html = renderizar(metricas({ deriva: { mapaJaFechadas: 3, naoMapeadas: [] } }));

    expect(html).toContain('Nenhuma issue aberta fora do mapa.');
  });
});

describe('renderizar — velocidade', () => {
  it('mostra a nota de ausência de projeção e nenhuma data quando dataProjetada é null', () => {
    const html = renderizar(
      metricas({
        velocidade: {
          serie: [{ dia: '2026-08-06', fechadas: 0 }],
          mediaMovel7: 0,
          amostraDias: 1,
          diasRestantes: null,
          dataProjetada: null,
        },
      }),
    );

    expect(html).toContain('Sem fechamento nos últimos 7 dias');
    expect(html).not.toContain('Projeção:');
  });
});

describe('renderizar — nota de fase', () => {
  it('renderiza a nota quando a fase tem uma', () => {
    const html = renderizar(metricas({ fases: [fase({ id: '5', nota: 'exige credencial AWS' })] }));

    expect(html).toContain('⚠ exige credencial AWS');
  });

  it('não deixa marcação de nota quando a fase não tem uma', () => {
    // dataProjetada não-nulo: a única outra nota possível na página (velocidade) fica fora.
    const html = renderizar(metricas({ fases: [fase({ id: '1', nota: undefined })] }));

    expect(html).not.toContain('⚠');
  });
});

describe('renderizar — escaping', () => {
  it('escapa título de issue com marcação HTML', () => {
    const html = renderizar(
      metricas({ caminhoCritico: [item({ number: 10, title: "<script>alert('x')</script>" })] }),
    );

    expect(html).toContain('&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapa risco com aspas e apóstrofos', () => {
    const html = renderizar(metricas({ riscos: [`"aspas" & 'apóstrofos'`] }));

    expect(html).toContain('&quot;aspas&quot; &amp; &#39;apóstrofos&#39;');
    expect(html).not.toContain('"aspas"');
  });
});

describe('renderizar — KPI em andamento clicável', () => {
  it('vira um details com o responsável quando há tarefa reservada', () => {
    const html = renderizar(
      metricas({
        tarefasEmAndamento: [
          item({ number: 250, title: '[005] decisao humana', responsaveis: ['allanrobert10'] }),
        ],
      }),
    );

    expect(html).toContain('<details class="kpi abrivel">');
    expect(html).toContain('@allanrobert10');
    expect(html).toContain('[005] decisao humana');
    expect(html).toContain('/issues/250');
  });

  it('avisa quando a tarefa foi reservada sem ninguém atribuído', () => {
    const html = renderizar(metricas({ tarefasEmAndamento: [item({ number: 250 })] }));

    expect(html).toContain('sem responsável atribuído');
    expect(html).not.toContain('<span class="quem">');
  });

  it('continua um card estático, sem details, quando nada está em andamento', () => {
    const html = renderizar(metricas({ tarefasEmAndamento: [] }));

    // `abrivel` sozinho não serve de asserção: a classe existe no CSS sempre.
    // E `<details` sozinho também não: a seção de prioridades usa o mesmo elemento.
    expect(html).not.toContain('<details class="kpi abrivel">');
    expect(html).toContain('<div class="k">em andamento</div>');
  });

  it('abre os dois cards de forma independente', () => {
    const html = renderizar(
      metricas({
        tarefasEmAndamento: [item({ number: 250 })],
        tarefasBloqueadas: [item({ number: 688 })],
      }),
    );

    expect(html.match(/<details class="kpi abrivel">/g)).toHaveLength(2);
    expect(html).toContain('em andamento <span class="caret">');
    expect(html).toContain('bloqueadas <span class="caret">');
  });
});

describe('renderizar — KPI bloqueadas clicável', () => {
  it('lista as issues bloqueadas quando existem', () => {
    const html = renderizar(
      metricas({
        global: {
          total: 10,
          fechadas: 4,
          abertas: 6,
          percentual: 40,
          ready: 2,
          emAndamento: 0,
          bloqueadas: 2,
        },
        tarefasBloqueadas: [
          item({ number: 688, title: '[ADR-010] T4: guard comprador-responsavel' }),
          item({ number: 689, title: '[ADR-010] T5: guard compliance-admin' }),
        ],
      }),
    );

    expect(html).toContain('bloqueadas <span class="caret">');
    expect(html).toContain('[ADR-010] T4: guard comprador-responsavel');
    expect(html).toContain('/issues/689');
  });

  it('não avisa sobre responsável ausente em bloqueada — é o estado normal', () => {
    const html = renderizar(metricas({ tarefasBloqueadas: [item({ number: 688 })] }));

    expect(html).toContain('/issues/688');
    expect(html).not.toContain('sem responsável atribuído');
  });

  it('continua um card estático quando nada está bloqueado', () => {
    const html = renderizar(metricas({ tarefasBloqueadas: [] }));

    expect(html).toContain('<div class="k">bloqueadas</div>');
  });

  it('escapa login de responsável', () => {
    const html = renderizar(
      metricas({ tarefasEmAndamento: [item({ number: 1, responsaveis: ['<b>x</b>'] })] }),
    );

    expect(html).toContain('@&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('@<b>x</b>');
  });
});

describe('renderizar — fila por prioridade', () => {
  it('soma todas as faixas no título da seção', () => {
    const html = renderizar(
      metricas({
        filaPorPrioridade: [
          { tier: 'P0', itens: [] },
          { tier: 'P1', itens: [item({ number: 1 }), item({ number: 2 })] },
          { tier: 'P2', itens: [item({ number: 3 })] },
          { tier: 'P3', itens: [] },
        ],
      }),
    );

    expect(html).toContain('Demandas em aberto por prioridade (3)');
  });

  it('renderiza um bloco por faixa não vazia e omite as vazias', () => {
    const html = renderizar(
      metricas({
        filaPorPrioridade: [
          { tier: 'P0', itens: [] },
          { tier: 'P1', itens: [item({ number: 1 })] },
          { tier: 'P2', itens: [item({ number: 2 })] },
          { tier: 'P3', itens: [] },
        ],
      }),
    );

    expect(html.match(/<details class="fila">/g)).toHaveLength(2);
    expect(html).toContain('>P1</span>');
    expect(html).toContain('>P2</span>');
    expect(html).not.toContain('>P3</span>');
  });

  it('concorda o plural com a contagem', () => {
    const uma = renderizar(
      metricas({
        filaPorPrioridade: [
          { tier: 'P0', itens: [] },
          { tier: 'P1', itens: [item({ number: 1 })] },
          { tier: 'P2', itens: [] },
          { tier: 'P3', itens: [] },
        ],
      }),
    );

    // Espaços normalizados: o template quebra linha entre a contagem e o caret.
    expect(uma.replace(/\s+/g, ' ')).toContain('P1</span> 1 demanda<span class="caret">');
  });
});

describe('renderizar — data e hora', () => {
  it('mostra o instante de geração como DD/MM/AAAA HH:MM:SS no fuso de Brasília', () => {
    // 12:00Z é 09:00 em Brasília (UTC-3) — o teste falha se o fuso local vazar.
    const html = renderizar(metricas({ geradoEm: '2026-08-06T12:00:00.000Z' }));

    expect(html).toContain('Gerado em 06/08/2026 09:00:00 (Brasília)');
    expect(html).not.toContain('2026-08-06T12:00:00.000Z');
  });

  it('vira o dia quando o horário UTC cai antes das 03:00', () => {
    const html = renderizar(metricas({ geradoEm: '2026-08-07T01:30:15.000Z' }));

    expect(html).toContain('Gerado em 06/08/2026 22:30:15 (Brasília)');
  });

  it('usa relógio de 24 horas à meia-noite, não 24:00', () => {
    const html = renderizar(metricas({ geradoEm: '2026-08-07T03:00:00.000Z' }));

    expect(html).toContain('Gerado em 07/08/2026 00:00:00 (Brasília)');
  });

  it('mostra a data projetada como DD/MM/AAAA', () => {
    const html = renderizar(metricas());

    expect(html).toContain('<strong>11/08/2026</strong>');
    expect(html).not.toContain('2026-08-11');
  });

  it('rotula as colunas do gráfico como DD/MM', () => {
    const html = renderizar(metricas());

    expect(html).toContain('<span>05/08</span>');
    expect(html).toContain('title="06/08/2026: 2"');
  });
});

describe('renderizarParaImpressao', () => {
  /** `Metricas` com conteúdo em toda seção que muda de forma na impressão. */
  const completa = () =>
    metricas({
      tarefasEmAndamento: [item({ number: 250, responsaveis: ['allanrobert10'] })],
      tarefasBloqueadas: [item({ number: 690 })],
      filaPorPrioridade: [
        { tier: 'P0', itens: [] },
        { tier: 'P1', itens: [item({ number: 1 })] },
        { tier: 'P2', itens: [item({ number: 2 })] },
        { tier: 'P3', itens: [item({ number: 3 })] },
      ],
    });

  it('não usa details em nenhum lugar — conteúdo colapsado não imprime', () => {
    const html = renderizarParaImpressao(completa());

    expect(html).not.toContain('<details');
    expect(html).not.toContain('<summary');
  });

  it('mostra todas as faixas de prioridade abertas', () => {
    const html = renderizarParaImpressao(completa());

    expect(html.match(/<section class="fila aberta">/g)).toHaveLength(3);
    expect(html).toContain('/issues/1');
    expect(html).toContain('/issues/2');
    expect(html).toContain('/issues/3');
  });

  it('vira as tarefas em seção própria, com responsável em coluna', () => {
    const html = renderizarParaImpressao(completa());

    expect(html).toContain('Em andamento (1)');
    expect(html).toContain('Bloqueadas (1)');
    expect(html).toContain('allanrobert10');
    expect(html).toContain('<th>responsável</th>');
  });

  it('usa tema claro e força impressão de cor nas barras', () => {
    const html = renderizarParaImpressao(completa());

    expect(html).toContain('--bg:#FFFFFF');
    expect(html).not.toContain('--bg:#0B0E14');
    expect(html).toContain('print-color-adjust:exact');
    expect(html).toContain('@page{margin:12mm;}');
  });

  it('omite seção de tarefas quando a lista está vazia', () => {
    const html = renderizarParaImpressao(
      metricas({ tarefasEmAndamento: [], tarefasBloqueadas: [] }),
    );

    expect(html).not.toContain('Em andamento (');
    expect(html).not.toContain('Bloqueadas (');
  });

  it('mantém tema escuro e details na versão de tela', () => {
    const html = renderizar(completa());

    expect(html).toContain('--bg:#0B0E14');
    expect(html).not.toContain('@page');
    expect(html).toContain('<details');
  });

  it('não deixa undefined, NaN ou [object Object] na versão de impressão', () => {
    const html = renderizarParaImpressao(completa());

    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('[object Object]');
  });
});

describe('renderizar — ausência de valores estranhos', () => {
  it('não deixa undefined, NaN ou [object Object] em uma Metricas totalmente populada', () => {
    const html = renderizar(
      metricas({
        fases: [fase({ id: '1' }), fase({ id: '5', nota: 'exige credencial AWS' })],
      }),
    );

    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('[object Object]');
  });
});
