# Dashboard de status do projeto — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar, por um comando local, uma página HTML autocontida que cruza o estado vivo das 425 issues do board com a camada curada do `docs/plano-finalizacao.md` (fases, prioridades, riscos).

**Architecture:** Três unidades com fronteira explícita — `coletar` (único I/O de rede, via `gh`), `calcular` (função pura, toda a regra, única testada) e `renderizar` (pura, string HTML). Um `main()` amarra as três e grava `docs/dashboard.html`. A camada curada vive em `docs/dashboard-mapa.json`, editado à mão.

**Tech Stack:** TypeScript ESM (`module: NodeNext`), `tsx` para execução, Zod para validação de entrada, Vitest para o teste, `gh` CLI como fonte de dados. Nenhuma dependência nova.

## Global Constraints

- **Nenhuma dependência nova.** Tudo usado já está no `package.json`: `zod`, `tsx`, `vitest`.
- **TypeScript strict com `noUncheckedIndexedAccess: true`** — indexar array devolve `T | undefined`. Evite indexação por número; prefira `.find`, `.filter`, `.slice`, `.reduce`.
- **`verbatimModuleSyntax: true`** — importe tipos com `import type { X } from '...'`, nunca `import { X }` para um tipo puro.
- **`module: NodeNext`** — todo import relativo termina em `.js`, mesmo apontando para um arquivo `.ts`. Exemplo: `import { calcular } from './dashboard-metricas.js'`.
- **Prettier** (`.prettierrc.json`): `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`. O `lint-staged` roda `prettier --write` no commit — escreva já formatado para o diff não mudar sozinho.
- **Idioma do código**: identificadores, comentários e JSDoc em português, como o resto de `src/dev/`.
- **`console.log` é permitido** em `src/dev/**` (ver `src/dev/seed-localstack.ts`); não há regra de lint contra ele.
- **Não rode `pnpm test` sem filtro.** O `vitest.config.ts` não exclui `.claude/worktrees/**`, então uma rodada completa varre os worktrees de outros agentes. Sempre passe o caminho do arquivo de teste.

## Desvios conscientes em relação à spec

Dois, ambos por necessidade técnica descoberta ao ler o código:

1. **A spec diz "um arquivo, `src/dev/dashboard.ts`". O plano usa três.** Motivo: `src/dev/seed-localstack.ts` termina em `await main()` no topo do módulo, e é o padrão da pasta. Um teste que importasse `calcular` de um módulo assim executaria `main()` — e portanto o `gh` — só por importar. A lógica pura precisa morar num módulo sem efeito colateral. Os três arquivos são flat (`dashboard.ts`, `dashboard-metricas.ts`, `dashboard-html.ts`), sem diretório nem barrel.
2. **A spec diz "Fases 0-5". O `plano-finalizacao.md` tem sete fases (0 a 6).** O mapa curado inclui as sete.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Testado |
|---|---|---|
| `src/dev/dashboard-metricas.ts` | tipos do domínio, schemas Zod, `calcular()` — pura | sim, integralmente |
| `src/dev/dashboard-html.ts` | `renderizar(metricas): string` — pura, sem regra | não (interpolação sem ramificação) |
| `src/dev/dashboard.ts` | `coletar()` via `gh`, leitura do mapa, `main()`, escrita do HTML | não (processo externo) |
| `docs/dashboard-mapa.json` | camada curada: fases, prioridades, riscos | validado por Zod em runtime |
| `tests/dev/dashboard-metricas.test.ts` | teste de `calcular()` com fixture à mão | — |
| `package.json` | script `dashboard` | — |
| `docs/dashboard.html` | saída gerada, commitada | — |

---

### Task 1: Modelo de dados e agrupamento por spec

Entrega: `calcular()` devolvendo o resumo global e a distribuição por spec, com a regra de agrupamento correta (prefixo do título, não milestone).

**Files:**
- Create: `src/dev/dashboard-metricas.ts`
- Test: `tests/dev/dashboard-metricas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: os tipos `Issue`, `Mapa`, `Metricas` e suas partes; `issuesSchema`, `mapaSchema`; `calcular(issues: readonly Issue[], mapa: Mapa, agora: Date): Metricas`; a constante `SEM_SPEC = 'sem-spec'`. A Task 2 e a Task 3 estendem o mesmo `calcular` e o mesmo arquivo de teste; a Task 4 consome `issuesSchema`, `mapaSchema` e `calcular`.

O parâmetro `agora: Date` é injetado, não lido de `new Date()` dentro da função — sem isso o teste de velocidade da Task 3 seria não-determinístico.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/dev/dashboard-metricas.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
pnpm vitest run tests/dev/dashboard-metricas.test.ts
```

Esperado: FAIL — `Failed to resolve import "../../src/dev/dashboard-metricas.js"`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/dev/dashboard-metricas.ts`:

```ts
/**
 * Modelo e cálculo do dashboard de status do projeto.
 *
 * Módulo **puro**: nenhuma leitura de disco, de rede ou de relógio. `agora` é
 * parâmetro justamente para o cálculo de velocidade ser determinístico no teste.
 * Todo I/O vive em `dashboard.ts`; toda apresentação, em `dashboard-html.ts`.
 */
import { z } from 'zod';

export const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(['OPEN', 'CLOSED']),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  milestone: z.object({ title: z.string() }).nullable(),
  labels: z.array(z.object({ name: z.string() })),
  url: z.string(),
});

export const issuesSchema = z.array(issueSchema);

export type Issue = z.infer<typeof issueSchema>;

export const mapaSchema = z.object({
  gerado_de: z.string(),
  fases: z.array(
    z.object({
      id: z.string(),
      titulo: z.string(),
      status: z.enum(['concluida', 'em-andamento', 'pendente']),
      issues: z.array(z.number()),
      nota: z.string().optional(),
    }),
  ),
  prioridades: z.object({
    P0: z.array(z.number()),
    P1: z.array(z.number()),
    P2: z.array(z.number()),
    P3: z.array(z.number()),
  }),
  riscos: z.array(z.string()),
});

export type Mapa = z.infer<typeof mapaSchema>;

export interface ResumoGlobal {
  readonly total: number;
  readonly fechadas: number;
  readonly abertas: number;
  readonly percentual: number;
  readonly ready: number;
  readonly emAndamento: number;
  readonly bloqueadas: number;
}

export interface SpecMetrica {
  readonly spec: string;
  readonly abertas: number;
  readonly fechadas: number;
  readonly total: number;
  readonly percentual: number;
}

export interface Metricas {
  readonly geradoEm: string;
  readonly geradoDe: string;
  readonly global: ResumoGlobal;
  readonly specs: readonly SpecMetrica[];
}

/** Bucket das issues sem prefixo, sem milestone e sem label `spec-*`. */
export const SEM_SPEC = 'sem-spec';

const PREFIXO_SPEC = /^\[(\d{3})\]/;
const TRES_DIGITOS = /^\d{3}$/;

/** Percentual com uma casa decimal; total zero devolve 0 em vez de NaN. */
function percentual(parte: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((parte / total) * 1000) / 10;
}

function temLabel(issue: Issue, nome: string): boolean {
  return issue.labels.some((label) => label.name === nome);
}

/**
 * Bucket único da issue, na ordem prefixo → milestone → label.
 *
 * O prefixo vem primeiro porque cobre 419 das 425 issues do board e não diverge
 * da milestone em nenhum caso onde ambos existem, enquanto a milestone sozinha
 * perde 104 issues e o label duplicaria as 13 que carregam mais de um `spec-*`.
 */
export function specDaIssue(issue: Issue): string {
  const prefixo = PREFIXO_SPEC.exec(issue.title)?.[1];
  if (prefixo !== undefined) {
    return prefixo;
  }

  const daMilestone = issue.milestone?.title.slice(0, 3);
  if (daMilestone !== undefined && TRES_DIGITOS.test(daMilestone)) {
    return daMilestone;
  }

  const label = issue.labels.find((l) => l.name.startsWith('spec-'));
  if (label !== undefined) {
    return label.name.slice('spec-'.length);
  }

  return SEM_SPEC;
}

function resumoGlobal(issues: readonly Issue[]): ResumoGlobal {
  const abertas = issues.filter((i) => i.state === 'OPEN');
  const fechadas = issues.length - abertas.length;

  return {
    total: issues.length,
    fechadas,
    abertas: abertas.length,
    percentual: percentual(fechadas, issues.length),
    ready: abertas.filter((i) => temLabel(i, 'ready')).length,
    emAndamento: abertas.filter((i) => temLabel(i, 'in-progress')).length,
    bloqueadas: abertas.filter((i) => temLabel(i, 'blocked')).length,
  };
}

function metricasPorSpec(issues: readonly Issue[]): SpecMetrica[] {
  const buckets = new Map<string, Issue[]>();
  for (const issue of issues) {
    const spec = specDaIssue(issue);
    const atual = buckets.get(spec);
    if (atual === undefined) {
      buckets.set(spec, [issue]);
    } else {
      atual.push(issue);
    }
  }

  return [...buckets.entries()]
    .map(([spec, doBucket]) => {
      const abertas = doBucket.filter((i) => i.state === 'OPEN').length;
      const fechadas = doBucket.length - abertas;
      return {
        spec,
        abertas,
        fechadas,
        total: doBucket.length,
        percentual: percentual(fechadas, doBucket.length),
      };
    })
    .sort((a, b) => {
      // `sem-spec` não é numérico: vai sempre para o fim, sem participar da ordenação.
      if (a.spec === SEM_SPEC) return 1;
      if (b.spec === SEM_SPEC) return -1;
      return a.spec.localeCompare(b.spec);
    });
}

export function calcular(issues: readonly Issue[], mapa: Mapa, agora: Date): Metricas {
  return {
    geradoEm: agora.toISOString(),
    geradoDe: mapa.gerado_de,
    global: resumoGlobal(issues),
    specs: metricasPorSpec(issues),
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
pnpm vitest run tests/dev/dashboard-metricas.test.ts
```

Esperado: PASS, 8 testes.

- [ ] **Step 5: Verificar tipos e lint**

```bash
pnpm typecheck && pnpm lint
```

Esperado: sem erro em nenhum dos dois.

- [ ] **Step 6: Commit**

```bash
git add src/dev/dashboard-metricas.ts tests/dev/dashboard-metricas.test.ts
git commit -m "feat(dashboard): modelo de metricas e agrupamento por spec"
```

---

### Task 2: Mapa curado, fases, caminho crítico e deriva

Entrega: o `docs/dashboard-mapa.json` real (extraído do `plano-finalizacao.md`) e o cruzamento dele com o board — fases com percentual, caminho crítico vivo, e as duas seções de deriva.

**Files:**
- Create: `docs/dashboard-mapa.json`
- Modify: `src/dev/dashboard-metricas.ts` (adicionar tipos e funções; estender `Metricas` e `calcular`)
- Modify: `tests/dev/dashboard-metricas.test.ts` (novos `describe`, sem alterar os existentes)

**Interfaces:**
- Consumes: da Task 1 — `Issue`, `Mapa`, `Metricas`, `calcular`, `specDaIssue`, `SEM_SPEC`, o helper interno `percentual`.
- Produces: os tipos `FaseMetrica`, `ItemIssue`, `Deriva`; e três campos novos em `Metricas`: `fases: readonly FaseMetrica[]`, `caminhoCritico: readonly ItemIssue[]`, `deriva: Deriva`, `riscos: readonly string[]`. A Task 4 renderiza todos.

- [ ] **Step 1: Gerar a lista P3 sem digitar número à mão**

O `plano-finalizacao.md` coloca em P3 duas faixas: a trilha de Acompanhamento de 007 e o restante de 008/009. Digitar ~80 números à mão erra. Rode e guarde a saída:

```bash
gh issue list --state open --limit 800 --json number,title \
  --jq '[.[] | select(.title | test("^\\[(008|009)\\]")) | .number] | sort | join(", ")'
```

Guarde também a faixa de Acompanhamento (007, T020-T038, menos #282 e #297, que já fecharam):

```bash
gh issue list --state open --limit 800 --json number,title \
  --jq '[.[] | select(.number >= 283 and .number <= 301) | .number] | sort | join(", ")'
```

As duas saídas concatenadas viram o array `P3` do próximo passo.

- [ ] **Step 2: Escrever o mapa curado**

Criar `docs/dashboard-mapa.json`. Os arrays de `fases` e `prioridades` P0-P2 abaixo saem literalmente das seções 3 e 4 do `docs/plano-finalizacao.md`; substitua **apenas** o `P3: []` pelos números obtidos no Step 1.

```json
{
  "gerado_de": "docs/plano-finalizacao.md — 3ª revisão, 2026-08-06",
  "fases": [
    {
      "id": "0",
      "titulo": "Desbloqueio imediato",
      "status": "concluida",
      "issues": [592, 618]
    },
    {
      "id": "1",
      "titulo": "Retrofit multi-tenant 007 (001-005)",
      "status": "concluida",
      "issues": [
        277, 278, 279, 280, 281, 297, 582, 583, 584, 585, 586, 587, 631, 632, 648, 649, 650, 656
      ]
    },
    {
      "id": "2",
      "titulo": "Completar 005 (decisão, reenvio, integração) e 003 (categorização)",
      "status": "em-andamento",
      "issues": [
        149, 150, 151, 152, 153, 154, 155, 156, 229, 230, 237, 238, 239, 241, 242, 243, 244, 246,
        248, 250, 251, 252, 253, 254, 255, 256, 257, 260, 261, 262, 263, 664
      ]
    },
    {
      "id": "3",
      "titulo": "Encadear o pipeline local completo (001→005)",
      "status": "pendente",
      "issues": [192, 200]
    },
    {
      "id": "4",
      "titulo": "Handlers de produção 001-003, IAM e Acompanhamento",
      "status": "pendente",
      "issues": [
        53, 65, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 298, 299,
        300, 301, 576, 577, 578, 579, 580, 588, 589, 590, 613, 614, 615, 616, 617, 619, 620, 621,
        641
      ]
    },
    {
      "id": "5",
      "titulo": "Validação com AWS real",
      "status": "pendente",
      "nota": "exige credencial AWS — o time não tem acesso hoje",
      "issues": [63, 64, 107, 109, 157, 158, 202, 203, 258, 259, 314, 315, 316, 317, 318, 580]
    },
    {
      "id": "6",
      "titulo": "008 LGPD e 009 custo (restante)",
      "status": "pendente",
      "issues": []
    }
  ],
  "prioridades": {
    "P0": [],
    "P1": [
      149, 150, 151, 152, 153, 154, 155, 229, 237, 238, 246, 248, 250, 251, 252, 253, 254, 255,
      256, 635, 664
    ],
    "P2": [
      53, 54, 61, 62, 63, 64, 65, 107, 109, 110, 156, 157, 158, 159, 160, 186, 187, 192, 195, 196,
      197, 200, 201, 202, 203, 204, 205, 206, 230, 239, 241, 242, 243, 244, 257, 258, 259, 260,
      261, 262, 263, 576, 577, 578, 579, 580, 588, 589, 590, 613, 614, 615, 616, 617, 619, 620,
      621, 641
    ],
    "P3": []
  },
  "riscos": [
    "Cutover de tenantId já é produção-visível em 004/005, mas nenhuma dessas Lambdas rodou em AWS real — LocalStack não aplica IAM nem RLS Postgres como o Aurora.",
    "#635 (teste adversarial de tenantId forjado) segue OPEN: o retrofit de segurança fechou por código, sem prova automatizada sob adversário.",
    "005 é o BC de maior risco financeiro e menor cobertura de regra de negócio, e agora sem gate formal na frente — fácil de adiar por conveniência.",
    "#664 (modelo Bedrock do Agente Orquestrador) é decisão em aberto sem ADR; trabalho em 005 que assuma um cliente específico corre risco de retrabalho.",
    "001-003 seguem sem handler de produção (#613-#616) enquanto 004/005 já têm — o pipeline de produção está desbalanceado.",
    "Ollama (#617, #619, #620, #621) não reduz a necessidade de validação com Bedrock real na Fase 5."
  ]
}
```

Preencher a Fase 6 com os mesmos números de 008/009 do Step 1 (a faixa de 008/009 aparece tanto na Fase 6 quanto em P3 — são eixos diferentes, fase e prioridade, e a duplicação é esperada).

- [ ] **Step 3: Escrever os testes que falham**

Acrescentar ao fim de `tests/dev/dashboard-metricas.test.ts` (mantendo tudo que já existe):

```ts
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
```

- [ ] **Step 4: Rodar e confirmar que falha**

```bash
pnpm vitest run tests/dev/dashboard-metricas.test.ts
```

Esperado: FAIL — `fases`, `caminhoCritico`, `deriva` e `riscos` não existem em `Metricas` (erro de tipo no editor e `undefined` em runtime).

- [ ] **Step 5: Implementar**

Em `src/dev/dashboard-metricas.ts`, acrescentar os tipos antes de `Metricas`:

```ts
export interface FaseMetrica {
  readonly id: string;
  readonly titulo: string;
  readonly status: 'concluida' | 'em-andamento' | 'pendente';
  readonly nota: string | undefined;
  readonly total: number;
  readonly fechadas: number;
  readonly percentual: number;
}

export interface ItemIssue {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly spec: string;
}

export interface Deriva {
  /** Issues citadas nas prioridades do mapa que já fecharam — sinal de plano defasado. */
  readonly mapaJaFechadas: number;
  /** Issues abertas que nenhuma prioridade do mapa cita — sinal de triagem pendente. */
  readonly naoMapeadas: readonly ItemIssue[];
}
```

Estender `Metricas` com os quatro campos novos:

```ts
export interface Metricas {
  readonly geradoEm: string;
  readonly geradoDe: string;
  readonly global: ResumoGlobal;
  readonly specs: readonly SpecMetrica[];
  readonly fases: readonly FaseMetrica[];
  readonly caminhoCritico: readonly ItemIssue[];
  readonly deriva: Deriva;
  readonly riscos: readonly string[];
}
```

Acrescentar as funções antes de `calcular`:

```ts
function paraItem(issue: Issue): ItemIssue {
  return { number: issue.number, title: issue.title, url: issue.url, spec: specDaIssue(issue) };
}

function metricasPorFase(issues: readonly Issue[], mapa: Mapa): FaseMetrica[] {
  const porNumero = new Map(issues.map((i) => [i.number, i]));

  return mapa.fases.map((fase) => {
    // Número do mapa sem issue correspondente no board (removida, ou digitada errado)
    // simplesmente não conta — o mapa é curado à mão e não deve derrubar a geração.
    const daFase = fase.issues.flatMap((numero) => {
      const issue = porNumero.get(numero);
      return issue === undefined ? [] : [issue];
    });
    const fechadas = daFase.filter((i) => i.state === 'CLOSED').length;

    return {
      id: fase.id,
      titulo: fase.titulo,
      status: fase.status,
      nota: fase.nota,
      total: daFase.length,
      fechadas,
      percentual: percentual(fechadas, daFase.length),
    };
  });
}

function todosOsNumerosPriorizados(mapa: Mapa): Set<number> {
  const { P0, P1, P2, P3 } = mapa.prioridades;
  return new Set([...P0, ...P1, ...P2, ...P3]);
}

function caminhoCritico(issues: readonly Issue[], mapa: Mapa): ItemIssue[] {
  const p1 = new Set(mapa.prioridades.P1);
  return issues
    .filter((i) => i.state === 'OPEN' && p1.has(i.number))
    .sort((a, b) => a.number - b.number)
    .map(paraItem);
}

function deriva(issues: readonly Issue[], mapa: Mapa): Deriva {
  const priorizadas = todosOsNumerosPriorizados(mapa);

  return {
    mapaJaFechadas: issues.filter((i) => i.state === 'CLOSED' && priorizadas.has(i.number)).length,
    naoMapeadas: issues
      .filter((i) => i.state === 'OPEN' && !priorizadas.has(i.number))
      .sort((a, b) => a.number - b.number)
      .map(paraItem),
  };
}
```

Substituir o corpo de `calcular`:

```ts
export function calcular(issues: readonly Issue[], mapa: Mapa, agora: Date): Metricas {
  return {
    geradoEm: agora.toISOString(),
    geradoDe: mapa.gerado_de,
    global: resumoGlobal(issues),
    specs: metricasPorSpec(issues),
    fases: metricasPorFase(issues, mapa),
    caminhoCritico: caminhoCritico(issues, mapa),
    deriva: deriva(issues, mapa),
    riscos: mapa.riscos,
  };
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
pnpm vitest run tests/dev/dashboard-metricas.test.ts
```

Esperado: PASS, 14 testes.

- [ ] **Step 7: Verificar que o mapa real passa no schema**

```bash
pnpm tsx -e "import {readFileSync} from 'node:fs'; import {mapaSchema} from './src/dev/dashboard-metricas.ts'; const m = mapaSchema.parse(JSON.parse(readFileSync('docs/dashboard-mapa.json','utf8'))); console.log('mapa ok:', m.fases.length, 'fases,', m.prioridades.P1.length, 'issues P1,', m.riscos.length, 'riscos');"
```

Esperado: `mapa ok: 7 fases, 21 issues P1, 6 riscos`.

- [ ] **Step 8: Typecheck, lint e commit**

```bash
pnpm typecheck && pnpm lint
git add src/dev/dashboard-metricas.ts tests/dev/dashboard-metricas.test.ts docs/dashboard-mapa.json
git commit -m "feat(dashboard): mapa curado, fases, caminho critico e deteccao de deriva"
```

---

### Task 3: Velocidade e projeção

Entrega: série de fechamento diário dos últimos 14 dias, média móvel de 7 dias e projeção de conclusão rotulada com o tamanho da amostra.

**Files:**
- Modify: `src/dev/dashboard-metricas.ts`
- Modify: `tests/dev/dashboard-metricas.test.ts`

**Interfaces:**
- Consumes: da Task 1/2 — `Issue`, `Mapa`, `Metricas`, `calcular`, `resumoGlobal`.
- Produces: `PontoVelocidade`, `Velocidade`, e o campo `velocidade: Velocidade` em `Metricas`. A Task 4 renderiza.

Regra da projeção, fixada aqui para não haver interpretação: `diasRestantes = ceil(abertas / mediaMovel7)`; `dataProjetada = agora + diasRestantes dias`, em `YYYY-MM-DD`. Média móvel zero **suprime** a projeção (`null` nos dois campos) em vez de dividir por zero. `amostraDias` é a distância em dias inteiros entre o `closedAt` mais antigo do board e `agora`, com mínimo de 1.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `tests/dev/dashboard-metricas.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
pnpm vitest run tests/dev/dashboard-metricas.test.ts
```

Esperado: FAIL — `velocidade` não existe em `Metricas`.

- [ ] **Step 3: Implementar**

Em `src/dev/dashboard-metricas.ts`, acrescentar os tipos:

```ts
export interface PontoVelocidade {
  /** Dia em UTC, `YYYY-MM-DD`. */
  readonly dia: string;
  readonly fechadas: number;
}

export interface Velocidade {
  readonly serie: readonly PontoVelocidade[];
  readonly mediaMovel7: number;
  /** Dias entre o fechamento mais antigo do board e agora — o rótulo de confiança. */
  readonly amostraDias: number;
  readonly diasRestantes: number | null;
  readonly dataProjetada: string | null;
}
```

Acrescentar o campo `readonly velocidade: Velocidade;` em `Metricas`, e as constantes e funções:

```ts
const JANELA_DIAS = 14;
const MEDIA_DIAS = 7;
const MS_DIA = 86_400_000;

/** Dia UTC de um instante ISO — o `slice` basta porque `gh` sempre devolve em Z. */
function diaUTC(iso: string): string {
  return iso.slice(0, 10);
}

function velocidade(issues: readonly Issue[], agora: Date, abertas: number): Velocidade {
  const fechamentos = issues.flatMap((i) => (i.closedAt === null ? [] : [i.closedAt]));

  const porDia = new Map<string, number>();
  for (const fechamento of fechamentos) {
    const dia = diaUTC(fechamento);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }

  const serie: PontoVelocidade[] = [];
  for (let atras = JANELA_DIAS - 1; atras >= 0; atras -= 1) {
    const dia = new Date(agora.getTime() - atras * MS_DIA).toISOString().slice(0, 10);
    serie.push({ dia, fechadas: porDia.get(dia) ?? 0 });
  }

  const mediaMovel7 =
    serie.slice(-MEDIA_DIAS).reduce((soma, ponto) => soma + ponto.fechadas, 0) / MEDIA_DIAS;

  const maisAntigo = fechamentos.reduce<string | null>(
    (menor, atual) => (menor === null || atual < menor ? atual : menor),
    null,
  );
  const amostraDias =
    maisAntigo === null
      ? 1
      : Math.max(1, Math.ceil((agora.getTime() - Date.parse(maisAntigo)) / MS_DIA));

  // Média zero não projeta: uma divisão por zero viraria Infinity e o dashboard
  // anunciaria uma data. Ausência de projeção é informação honesta.
  if (mediaMovel7 === 0) {
    return { serie, mediaMovel7, amostraDias, diasRestantes: null, dataProjetada: null };
  }

  const diasRestantes = Math.ceil(abertas / mediaMovel7);
  const dataProjetada = new Date(agora.getTime() + diasRestantes * MS_DIA)
    .toISOString()
    .slice(0, 10);

  return { serie, mediaMovel7, amostraDias, diasRestantes, dataProjetada };
}
```

Amarrar em `calcular` — note que `global` passa a ser calculado antes, para reaproveitar `abertas`:

```ts
export function calcular(issues: readonly Issue[], mapa: Mapa, agora: Date): Metricas {
  const global = resumoGlobal(issues);

  return {
    geradoEm: agora.toISOString(),
    geradoDe: mapa.gerado_de,
    global,
    specs: metricasPorSpec(issues),
    fases: metricasPorFase(issues, mapa),
    caminhoCritico: caminhoCritico(issues, mapa),
    deriva: deriva(issues, mapa),
    velocidade: velocidade(issues, agora, global.abertas),
    riscos: mapa.riscos,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
pnpm vitest run tests/dev/dashboard-metricas.test.ts
```

Esperado: PASS, 20 testes.

- [ ] **Step 5: Typecheck, lint e commit**

```bash
pnpm typecheck && pnpm lint
git add src/dev/dashboard-metricas.ts tests/dev/dashboard-metricas.test.ts
git commit -m "feat(dashboard): velocidade diaria, media movel e projecao com rotulo de amostra"
```

---

### Task 4: Coleta, renderização e o comando `pnpm dashboard`

Entrega: o dashboard real, gerado a partir do board de verdade e aberto no navegador.

**Files:**
- Create: `src/dev/dashboard-html.ts`
- Create: `src/dev/dashboard.ts`
- Modify: `package.json` (um script)
- Create: `docs/dashboard.html` (saída gerada, commitada)

**Interfaces:**
- Consumes: `Metricas` e suas partes, `issuesSchema`, `mapaSchema`, `calcular` — todos de `./dashboard-metricas.js`.
- Produces: `renderizar(metricas: Metricas): string` em `dashboard-html.ts`; nada em `dashboard.ts`, que é ponto de entrada.

- [ ] **Step 1: Escrever o renderizador**

Criar `src/dev/dashboard-html.ts`:

```ts
/**
 * Renderização do dashboard de status. Módulo puro: recebe números prontos e
 * devolve HTML autocontido — nenhuma regra de negócio, nenhum I/O.
 *
 * O tema reaproveita as variáveis CSS de `docs/index.html` para a página não
 * destoar do resto de `docs/`. Barras são CSS puro: nenhuma biblioteca de
 * gráfico entra aqui.
 */
import type { FaseMetrica, ItemIssue, Metricas, SpecMetrica } from './dashboard-metricas.js';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Título de issue é texto de terceiro e entra no HTML — escapar não é opcional. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (caractere) => ESCAPES[caractere] ?? caractere);
}

const ROTULO_STATUS: Readonly<Record<FaseMetrica['status'], string>> = {
  concluida: 'concluída',
  'em-andamento': 'em andamento',
  pendente: 'pendente',
};

function cardFase(fase: FaseMetrica): string {
  const nota =
    fase.nota === undefined ? '' : `<p class="nota">⚠ ${escapar(fase.nota)}</p>`;
  return `
    <article class="fase ${fase.status}">
      <header><span class="id">Fase ${escapar(fase.id)}</span><span class="pill">${ROTULO_STATUS[fase.status]}</span></header>
      <h3>${escapar(fase.titulo)}</h3>
      <div class="barra"><div class="preenchida" style="width:${fase.percentual}%"></div></div>
      <p class="num">${fase.fechadas}/${fase.total} · ${fase.percentual}%</p>
      ${nota}
    </article>`;
}

function linhaSpec(spec: SpecMetrica): string {
  return `
    <div class="linha">
      <span class="rotulo">${escapar(spec.spec)}</span>
      <div class="barra"><div class="preenchida" style="width:${spec.percentual}%"></div></div>
      <span class="num">${spec.fechadas}/${spec.total} · ${spec.percentual}%</span>
    </div>`;
}

function linhaIssue(item: ItemIssue): string {
  return `
    <tr>
      <td class="mono"><a href="${escapar(item.url)}">#${item.number}</a></td>
      <td>${escapar(item.title)}</td>
      <td class="mono">${escapar(item.spec)}</td>
    </tr>`;
}

function graficoVelocidade(metricas: Metricas): string {
  const pico = Math.max(1, ...metricas.velocidade.serie.map((p) => p.fechadas));
  const colunas = metricas.velocidade.serie
    .map(
      (ponto) => `
      <div class="coluna" title="${ponto.dia}: ${ponto.fechadas}">
        <div class="haste" style="height:${(ponto.fechadas / pico) * 100}%"></div>
        <span>${ponto.dia.slice(5)}</span>
      </div>`,
    )
    .join('');

  const projecao =
    metricas.velocidade.dataProjetada === null
      ? '<p class="nota">Sem fechamento nos últimos 7 dias — nenhuma projeção é honesta aqui.</p>'
      : `<p class="num">Projeção: <strong>${metricas.velocidade.dataProjetada}</strong>
           (${metricas.velocidade.diasRestantes} dias no ritmo atual de
           ${metricas.velocidade.mediaMovel7.toFixed(1)}/dia)
           <span class="pill aviso">amostra de ${metricas.velocidade.amostraDias} dias</span></p>`;

  return `<div class="grafico">${colunas}</div>${projecao}`;
}

export function renderizar(metricas: Metricas): string {
  const { global, velocidade: v } = metricas;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nexo — Status do projeto</title>
<!--
  ARQUIVO GERADO — não edite à mão.
  Regerar com: pnpm dashboard
  Fonte curada: docs/dashboard-mapa.json (${escapar(metricas.geradoDe)})
-->
<style>
  :root{
    --bg:#0B0E14; --surface:#171B24; --surface-2:#1E2430; --border:rgba(255,255,255,.08);
    --magenta:#FF0099; --blue:#02A4F2; --gradient:linear-gradient(135deg,#FF0099,#02A4F2);
    --text:#F5F6FA; --text-muted:#9AA3B2; --success:#22C55E; --warning:#F5A623; --danger:#EF4444;
    --radius:16px;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;font-size:15px;}
  a{color:var(--blue);text-decoration:none;} a:hover{text-decoration:underline;}
  main{max-width:1100px;margin:0 auto;padding:48px 5vw 80px;}
  h1{font-size:clamp(26px,4vw,40px);font-weight:800;letter-spacing:-.5px;}
  h1 .g{background:var(--gradient);-webkit-background-clip:text;background-clip:text;color:transparent;}
  h2{font-size:19px;font-weight:800;margin:48px 0 18px;letter-spacing:-.2px;}
  h3{font-size:14.5px;font-weight:700;margin:6px 0 12px;}
  .sub{color:var(--text-muted);font-size:13px;margin-top:8px;}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;}
  .pill{display:inline-block;border:1px solid var(--border);background:var(--surface-2);border-radius:999px;padding:2px 10px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);}
  .pill.aviso{border-color:var(--warning);color:var(--warning);}
  .nota{color:var(--warning);font-size:12.5px;margin-top:10px;}
  .num{color:var(--text-muted);font-size:12.5px;}

  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:28px;}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;}
  .kpi .v{font-size:26px;font-weight:800;letter-spacing:-.5px;}
  .kpi .k{font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-muted);margin-top:4px;}

  .barra{background:var(--surface-2);border-radius:999px;height:9px;overflow:hidden;}
  .preenchida{height:100%;background:var(--gradient);border-radius:999px;}

  .fases{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;}
  .fase{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;}
  .fase.concluida{border-color:rgba(34,197,94,.4);}
  .fase.em-andamento{border-color:rgba(2,164,242,.5);}
  .fase header{display:flex;justify-content:space-between;align-items:center;gap:10px;}
  .fase .id{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-muted);}
  .fase .num{margin-top:8px;}

  .linha{display:grid;grid-template-columns:52px 1fr 130px;align-items:center;gap:14px;padding:7px 0;}
  .linha .rotulo{font-family:ui-monospace,monospace;font-size:12.5px;font-weight:700;}
  .linha .num{text-align:right;}

  table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
  th,td{text-align:left;padding:9px 14px;border-bottom:1px solid var(--border);font-size:13.5px;vertical-align:top;}
  th{font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-muted);}
  tr:last-child td{border-bottom:none;}

  .grafico{display:flex;align-items:flex-end;gap:5px;height:140px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:14px;}
  .coluna{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:6px;}
  .coluna .haste{width:100%;background:var(--gradient);border-radius:4px 4px 0 0;min-height:2px;}
  .coluna span{font-size:9.5px;color:var(--text-muted);white-space:nowrap;}

  ul.riscos{list-style:none;display:grid;gap:10px;}
  ul.riscos li{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--danger);border-radius:10px;padding:12px 16px;font-size:13.5px;}
  .vazio{color:var(--text-muted);font-size:13.5px;}
</style>
</head>
<body>
<main>
  <h1>Status do projeto <span class="g">Nexo</span></h1>
  <p class="sub">Gerado em ${escapar(metricas.geradoEm)} · camada curada: ${escapar(metricas.geradoDe)}</p>

  <div class="kpis">
    <div class="kpi"><div class="v">${global.percentual}%</div><div class="k">concluído</div></div>
    <div class="kpi"><div class="v">${global.fechadas}/${global.total}</div><div class="k">issues fechadas</div></div>
    <div class="kpi"><div class="v">${global.abertas}</div><div class="k">abertas</div></div>
    <div class="kpi"><div class="v">${global.ready}</div><div class="k">prontas p/ pegar</div></div>
    <div class="kpi"><div class="v">${global.emAndamento}</div><div class="k">em andamento</div></div>
    <div class="kpi"><div class="v">${global.bloqueadas}</div><div class="k">bloqueadas</div></div>
  </div>

  <h2>Fases</h2>
  <div class="fases">${metricas.fases.map(cardFase).join('')}</div>

  <h2>Progresso por spec</h2>
  ${metricas.specs.map(linhaSpec).join('')}

  <h2>Caminho crítico — P1 em aberto (${metricas.caminhoCritico.length})</h2>
  ${
    metricas.caminhoCritico.length === 0
      ? '<p class="vazio">Nenhuma P1 aberta.</p>'
      : `<table><thead><tr><th>issue</th><th>título</th><th>spec</th></tr></thead>
         <tbody>${metricas.caminhoCritico.map(linhaIssue).join('')}</tbody></table>`
  }

  <h2>Ritmo de fechamento — últimos 14 dias</h2>
  ${graficoVelocidade(metricas)}

  <h2>Riscos</h2>
  <ul class="riscos">${metricas.riscos.map((r) => `<li>${escapar(r)}</li>`).join('')}</ul>

  <h2>Deriva entre o plano e o board</h2>
  <p class="sub">${metricas.deriva.mapaJaFechadas} issues citadas no mapa já fecharam.
     ${metricas.deriva.naoMapeadas.length} abertas não aparecem em nenhuma prioridade —
     sinal de que <code>docs/plano-finalizacao.md</code> precisa de revisão.</p>
  ${
    metricas.deriva.naoMapeadas.length === 0
      ? '<p class="vazio">Nenhuma issue aberta fora do mapa.</p>'
      : `<table><thead><tr><th>issue</th><th>título</th><th>spec</th></tr></thead>
         <tbody>${metricas.deriva.naoMapeadas.map(linhaIssue).join('')}</tbody></table>`
  }

  <p class="sub" style="margin-top:48px">Arquivo gerado por <code>pnpm dashboard</code> — não editar à mão.
     Amostra de velocidade: ${v.amostraDias} dias.</p>
</main>
</body>
</html>
`;
}
```

- [ ] **Step 2: Escrever o coletor e o ponto de entrada**

Criar `src/dev/dashboard.ts`:

```ts
/**
 * Dashboard de status do projeto (`pnpm dashboard`).
 *
 * Cruza o estado vivo das issues do board com a camada curada de
 * `docs/dashboard-mapa.json` e grava `docs/dashboard.html`, autocontido — abre
 * por duplo clique, sem servidor.
 *
 * Este é o único módulo do trio com I/O: `dashboard-metricas.ts` (cálculo) e
 * `dashboard-html.ts` (renderização) são puros e não sabem que o `gh` existe.
 */
import { execFile } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { calcular, issuesSchema, mapaSchema } from './dashboard-metricas.js';
import type { Issue, Mapa } from './dashboard-metricas.js';
import { renderizar } from './dashboard-html.js';

const execFileAsync = promisify(execFile);

const CAMPOS = 'number,title,state,closedAt,createdAt,milestone,labels,url';

/** Acima das 425 issues de hoje, com folga — `gh` não pagina sozinho. */
const LIMITE = 800;

const RAIZ = new URL('../../', import.meta.url);
const CAMINHO_MAPA = new URL('docs/dashboard-mapa.json', RAIZ);
const CAMINHO_SAIDA = new URL('docs/dashboard.html', RAIZ);

async function coletar(): Promise<Issue[]> {
  let bruto: string;
  try {
    // A resposta passa de 500 KB: o maxBuffer padrão de 1 MB fica apertado demais
    // para o board continuar crescendo sem quebrar isto aqui.
    const { stdout } = await execFileAsync(
      'gh',
      ['issue', 'list', '--state', 'all', '--limit', String(LIMITE), '--json', CAMPOS],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    bruto = stdout;
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    throw new Error(
      `falha ao consultar o GitHub via gh: ${detalhe}\n` +
        'verifique se o gh está instalado e autenticado — rode: gh auth login',
    );
  }

  const validado = issuesSchema.safeParse(JSON.parse(bruto));
  if (!validado.success) {
    throw new Error(`resposta do gh fora do formato esperado:\n${validado.error.message}`);
  }
  return validado.data;
}

async function lerMapa(): Promise<Mapa> {
  const bruto = await readFile(CAMINHO_MAPA, 'utf8');
  const validado = mapaSchema.safeParse(JSON.parse(bruto));
  if (!validado.success) {
    throw new Error(
      `docs/dashboard-mapa.json inválido:\n${validado.error.message}\n` +
        'o mapa é editado à mão — corrija o arquivo e rode de novo',
    );
  }
  return validado.data;
}

async function main(): Promise<void> {
  const [issues, mapa] = await Promise.all([coletar(), lerMapa()]);
  const metricas = calcular(issues, mapa, new Date());

  // Só escreve depois que coleta, validação e cálculo passaram: um HTML pela
  // metade é pior que um HTML velho, porque não se anuncia como incompleto.
  await writeFile(CAMINHO_SAIDA, renderizar(metricas), 'utf8');

  console.log(`docs/dashboard.html gerado — ${metricas.global.percentual}% concluído`);
  console.log(
    `  ${metricas.global.fechadas}/${metricas.global.total} fechadas · ` +
      `${metricas.caminhoCritico.length} P1 abertas · ` +
      `${metricas.deriva.naoMapeadas.length} abertas fora do mapa`,
  );
}

await main();
```

- [ ] **Step 3: Registrar o comando**

Em `package.json`, dentro de `"scripts"`, logo depois da linha `"dev": ...`:

```json
    "dashboard": "tsx src/dev/dashboard.ts",
```

- [ ] **Step 4: Typecheck e lint**

```bash
pnpm typecheck && pnpm lint
```

Esperado: sem erro.

- [ ] **Step 5: Gerar o dashboard de verdade**

```bash
pnpm dashboard
```

Esperado: duas linhas de log, com o percentual próximo de 64% e o total próximo de 425 (os números crescem conforme o board anda).

- [ ] **Step 6: Conferir a página no navegador**

```bash
start docs/dashboard.html
```

Verificar, olhando: os 6 KPIs preenchidos; sete cards de fase, com a Fase 5 exibindo o aviso de credencial AWS; nove barras de spec; a tabela de caminho crítico com links que abrem no GitHub; o gráfico de 14 colunas com o selo "amostra de N dias"; seis riscos; e a seção de deriva. Nenhum `undefined`, `NaN` ou `[object Object]` em lugar nenhum da página.

- [ ] **Step 7: Confirmar que entrada inválida aborta antes de escrever**

Exercita a garantia central do tratamento de erro — nunca gravar um HTML pela metade. Renomeie o mapa, rode, e restaure:

```bash
git stash push --include-untracked docs/dashboard.html
mv docs/dashboard-mapa.json docs/dashboard-mapa.json.bak
pnpm dashboard; echo "exit=$?"
mv docs/dashboard-mapa.json.bak docs/dashboard-mapa.json
git stash pop
```

Esperado: a rodada falha com `ENOENT` mencionando `docs/dashboard-mapa.json` e `exit=1`; o `docs/dashboard.html` restaurado pelo `stash pop` é idêntico ao gerado no Step 5 (`git status --short docs/dashboard.html` não acusa modificação nova).

O ramo de erro do `gh` (mensagem `rode: gh auth login`) não é exercitado aqui — desligar o `gh` de forma portátil entre PowerShell e Git Bash custa mais que o valor do check. Confirme por leitura que o `catch` de `coletar()` lança antes de qualquer `writeFile`.

- [ ] **Step 8: Rodar a suíte do dashboard uma última vez**

```bash
pnpm vitest run tests/dev/dashboard-metricas.test.ts
```

Esperado: PASS, 20 testes.

- [ ] **Step 9: Commit**

```bash
git add src/dev/dashboard.ts src/dev/dashboard-html.ts package.json docs/dashboard.html
git commit -m "feat(dashboard): coleta via gh, renderizacao HTML e comando pnpm dashboard"
```

---

## Manutenção depois da entrega

Quando o `docs/plano-finalizacao.md` for revisado, atualize `docs/dashboard-mapa.json` e regenere. A seção "deriva" da própria página avisa quando isso está atrasado: issues abertas fora do mapa e issues do mapa que já fecharam são os dois contadores a observar.
