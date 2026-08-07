import { describe, expect, it } from 'vitest';
import { renderizar } from '../../src/dev/dashboard-html.js';
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
    const html = renderizar(metricas({ caminhoCritico: [] }));

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
