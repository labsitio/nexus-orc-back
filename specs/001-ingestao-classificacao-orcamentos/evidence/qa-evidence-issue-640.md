# QA — Issue #640 (fix, bounded context Ingestão & Identificação)

## Identificação

- SPEC_ID: 001-ingestao-classificacao-orcamentos
- Issue: #640
- PR: #644 (draft)
- Branch: fix/640-log-divergencia-tenant
- Commit testado: dc7460d7f8d8713a26fd3cd3f56ac4e2ce927c64
- Worktree: /home/victor1090/Documentos/Labs/wt-640-log-divergencia
- Data: 2026-08-04
- Ciclo: primeira validação (sem BUG-XXX aberto)

## Escopo da issue

`classificador-queue.handler.ts` tratava `TenantDivergenciaError` (agregado sem
`tenantId` OU `tenantId` divergente/cross-tenant) num único ramo, nível `info`,
mesma mensagem para os dois casos. Correção esperada: dois ramos, níveis
distintos (nenhum em `info`), comportamento de fluxo inalterado
(`continue`, nunca `batchItemFailures`/DLQ).

## Critérios de aceite — verificação

| # | Critério | Resultado |
|---|---|---|
| 1 | Ausência e divergência tratadas em ramos separados, níveis distintos, nenhum `info` | OK — `AUSENTE` → `logger.warn` (nível pino 40); `DIVERGENTE` → `logger.error` (nível pino 50). Ver `classificador-queue.handler.ts:126-151`. |
| 2 | Fluxo inalterado: `continue`, nunca `batchItemFailures`/DLQ | OK — ambos ramos terminam em `continue` (linha 152), antes do `falhas.push` do ramo genérico. |
| 3 | Teste por caso, assertando nível e campos estruturados | OK — 2 testes novos em `classificador-queue.handler.test.ts`, assertam `level === 40`/`50`, `level !== 30`, e campos (`orcamentoId`, `motivo`, `tenantIdSolicitante`, `tenantIdAgregado` conforme o caso). |
| 4 | Comentário explicando por que divergência não vai para DLQ | OK — comentário linhas 121-125 (`(fix #640) TenantDivergenciaError é permanente...`) e comentário específico do ramo `DIVERGENTE` (linhas 139-141) citando #299. |
| 5 | Auditoria dos outros handlers de fila — "não se aplica" registrado na PR | OK — PR #644 registra `extrator-queue.handler.ts` e `validador-queue.handler.ts` como "sem tratamento de tenant — não se aplica". Confirmado via grep local (`tenantId`/`TenantDivergencia`) nos dois arquivos: nenhuma ocorrência. |
| 6 | `tsc --noEmit`, `eslint`, suíte completa limpos | OK — ver seção Execução. |

## Origem do `motivo` (use case)

`classificar-orcamento.ts`: `TenantDivergenciaError` ganhou campo
`motivo: 'AUSENTE' | 'DIVERGENTE'` e `tenantIdAgregado`/`tenantIdSolicitante`
opcionais. Validação de tenant em `executar()` dividida em dois `if`
equivalentes ao comentário pré-existente (3 subcasos já documentados). Lógica
de negócio (quando cada caso ocorre, 404 sempre) inalterada — mudança é
estritamente de sinalização para o handler distinguir a origem sem
reinterpretar string de mensagem.

## Ambiente

```
source ~/.nvm/nvm.sh && nvm use 24
```
Node 16 (shell não-interativo) é incompatível — confirmado necessário antes de
qualquer comando.

## Execução

```
npx tsc --noEmit
```
Resultado: limpo, sem erros.

```
npx eslint \
  src/bounded-contexts/ingestao-identificacao/application/use-cases/classificar-orcamento.ts \
  src/bounded-contexts/ingestao-identificacao/interface/events/classificador-queue.handler.ts \
  tests/bounded-contexts/ingestao-identificacao/interface/classificador-queue.handler.test.ts
```
Resultado: limpo, sem erros/warnings.

```
npx vitest run
```
Resultado: 157 test files passed, 19 skipped (dependência de Postgres/pgvector
real, fora do escopo desta issue — limitação de ambiente preexistente, não
relacionada à mudança). 920 testes passed, 99 skipped, 0 failed.
Suíte alvo `tests/bounded-contexts/ingestao-identificacao/interface/classificador-queue.handler.test.ts`:
8 testes passed (6 preexistentes + 2 novos do fix).

Nenhuma falha nova, nenhum "expected fail" novo, nenhuma regressão.

## Cobertura

Sem alteração de threshold de cobertura solicitada ou necessária para esta
issue — mudança é log/sinalização em fluxo já coberto por testes preexistentes
(6 cenários) mais os 2 novos que exercitam exatamente os ramos alterados.
Ambos os ramos novos (`AUSENTE`/`DIVERGENTE`) são exercitados por teste
dedicado — 100% de cobertura de branch no trecho alterado.

## Defeitos encontrados

Nenhum.

## Riscos residuais / limitações

- Métrica/alarme CloudWatch para o caso `DIVERGENTE` (cross-tenant) ainda não
  existe — tratado explicitamente como fora de escopo desta issue, encaminhado
  para #641 (registrado na PR).
- Testes de integração dependentes de Postgres real (19 arquivos) não
  executados neste ambiente — limitação de ambiente preexistente, não
  introduzida por esta mudança, sem relação com o código alterado.

## Parecer final

APROVADO PELO QA
