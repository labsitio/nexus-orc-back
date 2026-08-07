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
