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
