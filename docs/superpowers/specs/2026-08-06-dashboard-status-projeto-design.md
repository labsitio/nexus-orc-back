# Dashboard de status do projeto — design

Data: 2026-08-06. Insumo: `docs/plano-finalizacao.md` (3ª revisão) e o estado
real das 425 issues de `labsitio/nexus-orc-back`, consultado via `gh` durante
o desenho.

## Problema

O `plano-finalizacao.md` responde "onde estamos" com precisão, mas é prosa
revisada à mão: cada revisão custa uma varredura completa do board e envelhece
no dia seguinte. Nenhuma das partes interessadas — nem o time, nem quem
acompanha de fora — tem um número atual de progresso sem alguém reescrever o
documento.

O dashboard não substitui o plano. O plano continua sendo onde mora o
julgamento (ordem, risco, caminho crítico); o dashboard mostra, a qualquer
momento, o estado factual do board cruzado com esse julgamento — e avisa
quando os dois divergem.

## Público e uso

Uma página, duas leituras. Topo executivo (progresso macro, fases, riscos)
para quem acompanha de fora; abaixo, detalhe operacional (barras por spec,
caminho crítico, velocidade) para o time. Ninguém precisa rolar até o fim para
saber como o projeto está.

## Medições que definiram o design

Números levantados no board em 2026-08-06, antes de qualquer decisão:

| Medição | Valor | Consequência de design |
|---|---|---|
| Issues totais / fechadas / abertas | 425 / 271 / 154 (63,8%) | confere com o plano — nenhuma correção necessária |
| Issues sem milestone | 104 | milestone é fonte incompleta; não serve de chave de agrupamento |
| Issues sem prefixo `[00X]` no título | 6 (419/425 cobertas) | prefixo é a chave de agrupamento |
| Divergência prefixo × milestone, onde ambos existem | 0 | prefixo é confiável; milestone vira fallback |
| Issues com mais de um label `spec-*` | 13 | agrupar por label duplicaria contagem |
| Janela de `closedAt` | 2026-07-29 a 2026-08-06 (9 dias) | previsão tem amostra curta; exige rótulo de confiança |
| Abertas por label | 149 `ready`, 2 `in-progress`, 0 `blocked` | confere com a seção 3 do plano |

Distribuição aberto/fechado por spec: `001` 14/58 · `002` 5/45 · `003` 13/41 ·
`004` 13/39 · `005` 25/36 · `007` 19/28 · `008` 32/15 · `009` 30/6.

## Decisões

| Decisão | Escolha | Alternativa descartada e por quê |
|---|---|---|
| Atualização | script local sob demanda (`pnpm dashboard`) | cron no GitHub Actions + Pages: infra e Pages em repo privado para um leitor que hoje é interno. Fetch ao vivo: repo privado exigiria token pessoal no `localStorage` do leitor |
| Saída | um HTML autocontido, dados inline | HTML + JSON separado: `fetch()` em `file://` é bloqueado, obrigaria servidor local sem ganho |
| Camada curada | `docs/dashboard-mapa.json` | parsear o `plano-finalizacao.md` com regex quebra na próxima revisão; criar labels `fase-N`/`prio-PN` custaria backfill em 425 issues e disciplina permanente |
| Agrupamento | prefixo `[00X]` do título | milestone perde 104 issues; label `spec-*` duplica 13 |
| Previsão de data | exibida com rótulo de amostra | omitir perde a pergunta que o executivo mais faz; exibir sem rótulo vira promessa |

## Arquitetura

Um arquivo, `src/dev/dashboard.ts`, seguindo o padrão de
`src/dev/seed-localstack.ts` (executado por `tsx`), exposto como
`pnpm dashboard`. Três unidades com fronteira explícita:

**`coletar(): Promise<Issue[]>`** — único ponto que toca a rede. Executa
`gh issue list --state all --limit 800 --json number,title,state,closedAt,createdAt,milestone,labels,url`
e valida a resposta com Zod (já é dependência do projeto). Depende de: `gh`
autenticado. Não conhece métrica nem HTML.

**`calcular(issues: Issue[], mapa: Mapa): Metricas`** — função pura, sem I/O.
Toda a regra vive aqui: agrupamento, percentuais, cruzamento com o mapa
curado, detecção de deriva, série temporal de fechamento. Saída é um objeto
serializável. É a única unidade testada.

**`renderizar(metricas: Metricas): string`** — pura, sem regra de negócio.
Recebe números prontos e devolve o HTML. Trocar layout não toca cálculo.

`main()` amarra as três e grava `docs/dashboard.html`.

### Chave de agrupamento

Para cada issue, na ordem: prefixo `[00X]` do título → título da milestone →
label `spec-*` (a primeira, se houver mais de uma) → bucket `sem-spec`. Cada
issue cai em exatamente um bucket, então a soma dos buckets é 425.

### Mapa curado

`docs/dashboard-mapa.json`, quatro chaves de topo:

- `fases`: lista de `{ id, titulo, status, issues: number[], nota? }` — as
  fases 0-5 do plano. `status` ∈ `concluida | em-andamento | pendente`.
  A Fase 5 carrega `nota: "exige credencial AWS"`.
- `prioridades`: `{ "P0": number[], "P1": number[], "P2": number[], "P3": number[] }`.
- `riscos`: lista de strings, copiadas da seção "Riscos remanescentes".
- `gerado_de`: string apontando a revisão do plano que originou o mapa, para
  rastrear defasagem.

É o único arquivo a atualizar quando o plano for revisado.

## Blocos da página

Ordem de leitura: executivo em cima, operacional embaixo.

1. **Cabeçalho** — percentual global (271/425), timestamp de geração e a linha
   de estado: abertas, `ready`, `in-progress`, `blocked`.
2. **Fases 0-5** — um card por fase. Status vem do mapa; o percentual é
   calculado das issues daquela fase. Fase 5 exibe o selo de bloqueio por
   credencial AWS.
3. **Barras por spec** — 001 a 009, aberto/fechado, ordenadas por percentual
   concluído. Torna visível que 008 e 009 são a cauda.
4. **Caminho crítico** — tabela das issues P1 ainda abertas, com número,
   título e link vindos do `gh`. A linha desaparece sozinha quando a issue
   fecha.
5. **Velocidade** — barras de issues fechadas por dia nos últimos 14 dias e
   média móvel de 7 dias. A projeção é `issues abertas ÷ média móvel de 7
   dias`, arredondada para cima, somada à data de geração, e sempre exibida
   junto do rótulo "amostra de N dias" (N = dias entre o `closedAt` mais
   antigo e hoje). Média móvel zero suprime a projeção em vez de dividir por
   zero.
6. **Riscos** — a lista do mapa, sem transformação.

Barras desenhadas em CSS puro, reaproveitando as variáveis de tema de
`docs/index.html` (fundo escuro, gradiente magenta/azul, Inter). Sem
biblioteca de gráfico.

## Deriva entre plano e board

O dashboard trata a defasagem do mapa como informação, não como erro:

- Issue listada no mapa que já fechou: sai da lista e entra numa contagem
  "N issues do mapa já fechadas".
- Issue `OPEN` no board ausente de qualquer lista do mapa: aparece numa seção
  **"não mapeadas"**, com número e título.

Essas duas seções são o sinal de que o `plano-finalizacao.md` precisa de nova
revisão. Nenhuma delas interrompe a geração.

## Erros

`gh` ausente, deslogado, ou retornando exit code diferente de zero: o script
encerra com mensagem acionável (`rode: gh auth login`) e **não** grava o HTML —
um dashboard pela metade é pior que um dashboard velho, porque não se anuncia
como velho. Resposta do `gh` que não passa no Zod: mesmo tratamento, com o
erro de validação impresso.

## Teste

Um arquivo de teste sobre `calcular`, com uma fixture de aproximadamente 10
issues montada à mão, cobrindo: contagem global, agrupamento por prefixo,
issue sem prefixo caindo no fallback de milestone, issue com dois labels
`spec-*` contada uma única vez, issue do mapa já fechada saindo do caminho
crítico, e issue aberta fora do mapa aparecendo em "não mapeadas".

`coletar` e `renderizar` não são testados: o primeiro é uma chamada de
processo externo, o segundo é interpolação de string sem ramificação.

## Versionamento da saída

`docs/dashboard.html` vai commitado, com um comentário no topo marcando-o como
arquivo gerado e nomeando o comando que o gera. O histórico do arquivo no
`git log` vira, de graça, o registro de evolução do projeto ao longo do tempo.

## Fora de escopo

Servidor HTTP, execução em CI ou cron, token de acesso, biblioteca de gráfico,
drill-down por issue individual, filtro interativo na página, e qualquer
gravação de estado fora do próprio HTML. Cada um destes entra quando houver
demanda concreta — publicação para quem não roda `pnpm` é a primeira
candidata, e o formato autocontido escolhido aqui não atrapalha essa evolução.
