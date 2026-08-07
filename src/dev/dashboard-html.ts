/**
 * Renderização do dashboard de status. Módulo puro: recebe números prontos e
 * devolve HTML autocontido — nenhuma regra de negócio, nenhum I/O.
 *
 * O tema reaproveita as variáveis CSS de `docs/index.html` para a página não
 * destoar do resto de `docs/`. Barras são CSS puro: nenhuma biblioteca de
 * gráfico entra aqui.
 *
 * Dois modos, mesma estrutura de página e mesmos helpers:
 *
 * - `tela`: tema escuro, seções longas em `<details>` colapsado.
 * - `impressao`: tema claro e **tudo aberto**, para o Ctrl+P do navegador virar
 *   PDF legível. Não é um `@media print` do modo tela porque forçar um
 *   `<details>` fechado a abrir na impressão não é confiável — o Chrome esconde
 *   o conteúdo por mecanismo interno que o `display` da regra de print não
 *   vence. Markup diferente resolve; CSS sozinho, não.
 */
import type {
  FaseMetrica,
  FilaPrioridade,
  ItemIssue,
  Metricas,
  SpecMetrica,
} from './dashboard-metricas.js';

export type Modo = 'tela' | 'impressao';

/** Só os tokens de cor mudam entre os modos; gradiente e cores de acento são iguais. */
const TOKENS: Readonly<Record<Modo, string>> = {
  tela: `--bg:#0B0E14; --surface:#171B24; --surface-2:#1E2430; --border:rgba(255,255,255,.08);
    --text:#F5F6FA; --text-muted:#9AA3B2; --success:#22C55E; --warning:#F5A623; --danger:#EF4444;`,
  impressao: `--bg:#FFFFFF; --surface:#F7F8FA; --surface-2:#EDEFF3; --border:rgba(0,0,0,.14);
    --text:#11151C; --text-muted:#55606E; --success:#15803D; --warning:#B45309; --danger:#DC2626;`,
};

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

/**
 * Fuso fixo de Brasília, não o fuso da máquina: quem lê o dashboard está no
 * Brasil, e um horário que muda conforme quem gerou o arquivo não é auditável.
 */
const HORA_BRASILIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Instante ISO em UTC para `DD/MM/AAAA HH:MM:SS` no fuso de Brasília. */
function dataHoraBrasilia(iso: string): string {
  return HORA_BRASILIA.format(new Date(iso)).replace(', ', ' ');
}

/**
 * `AAAA-MM-DD` para `DD/MM/AAAA`. É uma data civil, não um instante — converter
 * fuso aqui deslocaria o dia em um.
 */
function dataBrasileira(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

const ROTULO_STATUS: Readonly<Record<FaseMetrica['status'], string>> = {
  concluida: 'concluída',
  'em-andamento': 'em andamento',
  pendente: 'pendente',
};

function cardFase(fase: FaseMetrica): string {
  const nota = fase.nota === undefined ? '' : `<p class="nota">⚠ ${escapar(fase.nota)}</p>`;
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

/**
 * KPI que abre ao clique e lista as issues por trás do número. `<details>` é
 * nativo: nenhum JavaScript, e por isso continua funcionando com a página aberta
 * por `file://`, sem servidor. Sem issue para listar, vira um card estático — um
 * card que abre para nada é pior que um card que não abre.
 *
 * `avisarSemDono` distingue os dois usos: em "em andamento", issue reservada sem
 * ninguém atribuído é anomalia digna de aviso; em "bloqueadas", é o normal.
 */
function kpiAbrivel(
  quantidade: number,
  rotulo: string,
  tarefas: readonly ItemIssue[],
  avisarSemDono: boolean,
  modo: Modo,
): string {
  // Na impressão o card fica estático: o painel é absoluto e não imprime bem, e
  // as mesmas tarefas saem em seção própria logo abaixo dos KPIs.
  if (tarefas.length === 0 || modo === 'impressao') {
    return `<div class="kpi"><div class="v">${quantidade}</div><div class="k">${rotulo}</div></div>`;
  }

  const linhas = tarefas
    .map((tarefa) => {
      const quem =
        tarefa.responsaveis.length === 0
          ? avisarSemDono
            ? '<span class="sem-dono">sem responsável atribuído</span>'
            : ''
          : tarefa.responsaveis
              .map((login) => `<span class="quem">@${escapar(login)}</span>`)
              .join(' ');
      return `
        <li>
          <div class="cabeca"><a href="${escapar(tarefa.url)}">#${tarefa.number}</a> ${quem}</div>
          <div class="t">${escapar(tarefa.title)}</div>
        </li>`;
    })
    .join('');

  return `
    <details class="kpi abrivel">
      <summary>
        <div class="v">${quantidade}</div>
        <div class="k">${rotulo} <span class="caret">▾</span></div>
      </summary>
      <ul class="tarefas">${linhas}</ul>
    </details>`;
}

function tabelaIssues(itens: readonly ItemIssue[]): string {
  return `<table><thead><tr><th>issue</th><th>título</th><th>spec</th></tr></thead>
        <tbody>${itens.map(linhaIssue).join('')}</tbody></table>`;
}

/**
 * Uma faixa de prioridade. Em `tela`, colapsada — 135 linhas abertas de uma vez
 * afogam a leitura. Em `impressao`, aberta, senão o PDF sai sem o backlog.
 */
function blocoPrioridade(fila: FilaPrioridade, modo: Modo): string {
  if (fila.itens.length === 0) {
    return '';
  }

  const cabeca = `<span class="tier ${fila.tier.toLowerCase()}">${fila.tier}</span>
        ${fila.itens.length} ${fila.itens.length === 1 ? 'demanda' : 'demandas'}`;

  if (modo === 'impressao') {
    return `
    <section class="fila aberta">
      <div class="cabeca-fila">${cabeca}</div>
      ${tabelaIssues(fila.itens)}
    </section>`;
  }

  return `
    <details class="fila">
      <summary>${cabeca}<span class="caret">▾</span></summary>
      ${tabelaIssues(fila.itens)}
    </details>`;
}

/** Lista de tarefas como seção plana — o formato de impressão dos cards que abrem. */
function secaoTarefas(titulo: string, itens: readonly ItemIssue[]): string {
  if (itens.length === 0) {
    return '';
  }

  const linhas = itens
    .map(
      (t) => `
      <tr>
        <td class="mono"><a href="${escapar(t.url)}">#${t.number}</a></td>
        <td>${escapar(t.title)}</td>
        <td class="mono">${t.responsaveis.length === 0 ? '—' : escapar(t.responsaveis.join(', '))}</td>
      </tr>`,
    )
    .join('');

  return `
  <h2>${escapar(titulo)} (${itens.length})</h2>
  <table><thead><tr><th>issue</th><th>título</th><th>responsável</th></tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function graficoVelocidade(metricas: Metricas): string {
  const pico = Math.max(1, ...metricas.velocidade.serie.map((p) => p.fechadas));
  const colunas = metricas.velocidade.serie
    .map(
      (ponto) => `
      <div class="coluna" title="${dataBrasileira(ponto.dia)}: ${ponto.fechadas}">
        <div class="haste" style="height:${(ponto.fechadas / pico) * 100}%"></div>
        <span>${dataBrasileira(ponto.dia).slice(0, 5)}</span>
      </div>`,
    )
    .join('');

  const projecao =
    metricas.velocidade.dataProjetada === null
      ? '<p class="nota">Sem fechamento nos últimos 7 dias — nenhuma projeção é honesta aqui.</p>'
      : `<p class="num">Projeção: <strong>${dataBrasileira(metricas.velocidade.dataProjetada)}</strong>
           (${metricas.velocidade.diasRestantes} dias no ritmo atual de
           ${metricas.velocidade.mediaMovel7.toFixed(1)}/dia)
           <span class="pill aviso">amostra de ${metricas.velocidade.amostraDias} dias</span></p>`;

  return `<div class="grafico">${colunas}</div>${projecao}`;
}

/** Versão de tela: tema escuro, seções longas colapsadas. */
export function renderizar(metricas: Metricas): string {
  return pagina(metricas, 'tela');
}

/**
 * Versão para o Ctrl+P virar PDF: tema claro, tudo aberto, quebras de página
 * controladas. Mesmos dados e mesmos helpers da versão de tela.
 */
export function renderizarParaImpressao(metricas: Metricas): string {
  return pagina(metricas, 'impressao');
}

function pagina(metricas: Metricas, modo: Modo): string {
  const { global, velocidade: v } = metricas;
  const impresso = modo === 'impressao';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nexo Back-end — Status do projeto${impresso ? ' (impressão)' : ''}</title>
<!--
  ARQUIVO GERADO — não edite à mão.
  Regerar com: pnpm dashboard
  Fonte curada: docs/dashboard-mapa.json (${escapar(metricas.geradoDe)})
-->
<style>
  :root{
    ${TOKENS[modo]}
    --magenta:#FF0099; --blue:#02A4F2; --gradient:linear-gradient(135deg,#FF0099,#02A4F2);
    --radius:16px;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;font-size:15px;}
  a{color:var(--blue);text-decoration:none;} a:hover{text-decoration:underline;}
  main{max-width:1600px;margin:0 auto;padding:48px clamp(20px,3.5vw,56px) 80px;}
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

  /* align-items:start impede que um card aberto estique a altura dos irmãos. */
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:28px;align-items:start;}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;}
  .kpi .v{font-size:26px;font-weight:800;letter-spacing:-.5px;}
  .kpi .k{font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-muted);margin-top:4px;}

  /* KPI clicável: o painel é absoluto para o título da issue ter largura de
     leitura, em vez de espremer na coluna estreita do grid. */
  .kpi.abrivel{position:relative;padding:0;cursor:pointer;}
  .kpi.abrivel summary{list-style:none;padding:18px;border-radius:var(--radius);}
  .kpi.abrivel summary::-webkit-details-marker{display:none;}
  .kpi.abrivel summary:hover{background:var(--surface-2);}
  .kpi.abrivel summary:focus-visible{outline:2px solid var(--blue);outline-offset:2px;}
  .kpi.abrivel .caret{display:inline-block;transition:transform .15s ease;}
  .kpi.abrivel[open] .caret{transform:rotate(180deg);}
  .kpi.abrivel[open]{border-color:var(--blue);}
  .tarefas{list-style:none;position:absolute;top:calc(100% + 6px);right:0;z-index:10;
    width:max-content;min-width:100%;max-width:min(520px,88vw);
    background:var(--surface-2);border:1px solid var(--border);border-radius:12px;
    padding:8px;display:grid;gap:6px;box-shadow:0 12px 32px rgba(0,0,0,.5);cursor:auto;}
  .tarefas li{padding:8px 10px;border-radius:8px;background:var(--surface);}
  .tarefas .cabeca{display:flex;align-items:center;gap:8px;font-size:12.5px;}
  .tarefas .quem{font-weight:700;color:var(--success);}
  .tarefas .sem-dono{color:var(--warning);font-size:11.5px;}
  .tarefas .t{font-size:12.5px;color:var(--text-muted);margin-top:3px;line-height:1.45;}

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

  .grafico{display:flex;align-items:flex-end;gap:5px;height:260px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:14px;}
  .coluna{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:6px;}
  .coluna .haste{width:100%;background:var(--gradient);border-radius:4px 4px 0 0;min-height:2px;}
  .coluna span{font-size:9.5px;color:var(--text-muted);white-space:nowrap;}

  .fila{background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:10px;}
  .fila summary{list-style:none;cursor:pointer;padding:12px 16px;display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--text-muted);border-radius:12px;}
  .fila summary::-webkit-details-marker{display:none;}
  .fila summary:hover{background:var(--surface-2);}
  .fila summary:focus-visible{outline:2px solid var(--blue);outline-offset:2px;}
  .fila[open] summary{border-bottom:1px solid var(--border);border-radius:12px 12px 0 0;}
  .fila[open] .caret{transform:rotate(180deg);}
  .fila .caret{display:inline-block;transition:transform .15s ease;margin-left:auto;}
  .fila .tier{font-weight:800;font-size:11px;letter-spacing:1px;padding:3px 9px;border-radius:6px;background:var(--surface-2);}
  .fila .tier.p0,.fila .tier.p1{color:var(--danger);}
  .fila .tier.p2{color:var(--warning);}
  .fila .tier.p3{color:var(--text-muted);}
  .fila table{border:none;border-radius:0 0 12px 12px;}
  .fila .cabeca-fila{display:flex;align-items:center;gap:10px;padding:12px 16px;font-size:13.5px;color:var(--text-muted);border-bottom:1px solid var(--border);}

  ul.riscos{list-style:none;display:grid;gap:10px;}
  /* Trava de medida: a 1600px de container, uma linha corrida de texto vira
     parede e ninguém lê até o fim. Os cards e tabelas podem esticar; prosa não. */
  ul.riscos li{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--danger);border-radius:10px;padding:12px 16px;font-size:13.5px;max-width:110ch;}
  p.sub{max-width:110ch;}
  .vazio{color:var(--text-muted);font-size:13.5px;}

  @media(max-width:640px){
    /* Rótulo e barra em cima, contagem embaixo — 3 colunas não cabem no celular. */
    .linha{grid-template-columns:44px 1fr;row-gap:2px;}
    .linha .num{grid-column:2;text-align:left;}
    /* 14 rótulos de data não cabem lado a lado; o title de cada coluna mantém o dado. */
    .coluna span{display:none;}
    .grafico{height:180px;}
    table{display:block;overflow-x:auto;}
  }
${
  impresso
    ? `
  @page{margin:12mm;}
  body{font-size:10.5pt;}
  main{max-width:none;padding:0;}
  h1{font-size:22pt;}
  h2{font-size:13pt;margin:22px 0 10px;break-after:avoid;}
  /* Sem isto o Chrome descarta todo background na impressão — as barras de
     progresso e as hastes do gráfico virariam retângulos invisíveis. */
  .preenchida,.haste,.tier,.pill{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .kpi,.fase,.fila,.grafico,ul.riscos li,tr{break-inside:avoid;}
  .grafico{height:150px;}
  .kpis{gap:8px;}
  .kpi{padding:12px;}
  .kpi .v{font-size:18pt;}
  a{color:var(--text);}
  .fila{margin-bottom:14px;}
`
    : ''
}</style>
</head>
<body>
<main>
  <h1>Status do projeto <span class="g">Nexo Back-end</span></h1>
  <p class="sub">Gerado em ${dataHoraBrasilia(metricas.geradoEm)} (Brasília) · camada curada: ${escapar(metricas.geradoDe)}</p>

  <div class="kpis">
    <div class="kpi"><div class="v">${global.percentual}%</div><div class="k">concluído</div></div>
    <div class="kpi"><div class="v">${global.fechadas}/${global.total}</div><div class="k">issues fechadas</div></div>
    <div class="kpi"><div class="v">${global.abertas}</div><div class="k">abertas</div></div>
    <div class="kpi"><div class="v">${global.ready}</div><div class="k">prontas p/ pegar</div></div>
    ${kpiAbrivel(global.emAndamento, 'em andamento', metricas.tarefasEmAndamento, true, modo)}
    ${kpiAbrivel(global.bloqueadas, 'bloqueadas', metricas.tarefasBloqueadas, false, modo)}
  </div>
${
  impresso
    ? secaoTarefas('Em andamento', metricas.tarefasEmAndamento) +
      secaoTarefas('Bloqueadas', metricas.tarefasBloqueadas)
    : ''
}

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

  <h2>Demandas em aberto por prioridade (${metricas.filaPorPrioridade.reduce((s, f) => s + f.itens.length, 0)})</h2>
  <p class="sub">Critério de priorização em <code>docs/plano-finalizacao.md</code> §3. Dentro de
     cada faixa não há ordem interna — a ordem de execução são as fases acima.</p>
  ${metricas.filaPorPrioridade.map((fila) => blocoPrioridade(fila, modo)).join('')}

  <h2>Ritmo de fechamento — últimos 14 dias</h2>
  ${graficoVelocidade(metricas)}

  <h2>Riscos</h2>
  <ul class="riscos">${metricas.riscos.map((r) => `<li>${escapar(r)}</li>`).join('')}</ul>

  <h2>Deriva entre o plano e o board</h2>
  <p class="sub">${metricas.deriva.mapaJaFechadas} issues citadas no mapa já fecharam.
     ${metricas.deriva.naoMapeadas.length} abertas não aparecem em nenhuma lista do mapa —
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
