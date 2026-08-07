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
      { cause: erro },
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
