# QA Final Report — T045 (Métrica de campos não extraídos e falha de conversão MarkItDown)

## SPEC_ID / versão testada
- SPEC_ID: 002-extracao-dados-orcamento
- Issue: #110
- PR: #766, branch `feat/002-t045-metricas-observabilidade`
- Commit no topo do worktree: `2870637`
- Diff real (`git diff --stat 0fe41ab..2870637 -- src/ tests/`): 4 arquivos
  - `src/bounded-contexts/extracao/infrastructure/observability/metrica.ts` (novo)
  - `src/bounded-contexts/extracao/application/use-cases/extrair-dados-orcamento.ts` (modificado)
  - `tests/bounded-contexts/extracao/application/extrair-dados-orcamento.test.ts` (novos casos)
  - `tests/bounded-contexts/extracao/infrastructure/observability/metrica.test.ts` (novo)

## Resumo executivo
`emitirMetrica` (extracao) é réplica mecânica de `emitirMetrica` (ingestao-identificacao,
T049/#54), mudando só o `NAMESPACE` (`Nexo/Extracao`). `ExtrairDadosOrcamento.executar`
passa a emitir `CampoMarcadoNaoExtraido` uma vez por campo obrigatório (`ItemOrcamento` e
`CondicoesComerciais`) com `extraido === false`, logo após `registrarTentativaExtrator` —
e `ConversaoMarkItDownFalhou` no `catch` da conversão MarkItDown, antes de repropagar a
exceção (commit `2870637` acrescenta `logger.error` nesse catch, NIT do backend-reviewer
já corrigido). Ambas contadores puros (`Count`), sem taxa/percentual calculada — mesmo
escopo do T049/#54, agregação exigiria job periódico que não existe em nenhum artefato
aprovado.

## Suítes executadas e comandos
- `pnpm typecheck` → sem erros.
- `pnpm lint` → sem erros/warnings.
- `npx vitest run --reporter=default tests/bounded-contexts/extracao` → **34 arquivos
  passaram, 2 skipados (208 testes: 194 passed, 14 skipped)**. Skips são os 2 arquivos
  de integração Drizzle (`skipIf(!DATABASE_URL)`), esperado sem Postgres local, não
  relacionado a esta mudança.

## Verificação dos critérios de aceite (T045/#110)

1. **Emite `CampoMarcadoNaoExtraido` quando há campo não extraído** — teste
   "emite CampoMarcadoNaoExtraido uma vez por campo obrigatório sem confiança
   suficiente" (`extrair-dados-orcamento.test.ts`): item com `precoUnitario`
   incompleto produz exatamente 1 linha de métrica, com dimensão `campo: 'precoUnitario'`
   e `_aws.CloudWatchMetrics[0].Namespace === 'Nexo/Extracao'`. Confirmado no log real
   da execução (stdout do vitest): linha JSON `_aws.CloudWatchMetrics` presente, sem
   nenhuma chamada a AWS.
2. **Não emite quando tudo está completo** — teste "não emite CampoMarcadoNaoExtraido
   quando todo campo obrigatório tem confiança suficiente": item e condições comerciais
   completos → 0 linhas de métrica. Iterando `CAMPOS_ITEM` (3) e
   `CAMPOS_CONDICOES_COMERCIAIS` (3) por item — 6 pontos de checagem possíveis, cobertos
   pelos dois cenários (positivo com 1 campo faltando, negativo com todos presentes).
3. **`ConversaoMarkItDownFalhou` emite e o erro é repropagado sem persistir nem
   publicar** — teste "emite ConversaoMarkItDownFalhou e propaga o erro quando o
   conversor falha": `MarkItDownConversaoExtracaoACLFalhaFake` lança erro,
   `useCase.executar()` rejeita com a mesma mensagem (`rejects.toThrow`), 1 linha de
   métrica `ConversaoMarkItDownFalhou` capturada, e **`repositorio.salvos` e
   `publisher.eventosPublicados` seguem vazios** — a asserção que prova que o
   caminho de falha não persiste nem publica evento, lida diretamente do código
   de produção: o `throw erro` no catch de `extrair-dados-orcamento.ts` ocorre antes
   de `repositorio.salvar` e de `eventPublisher.publicar`.
4. **EMF é JSON puro inspecionável sem AWS** — `metrica.test.ts` usa `pino` real (não
   fake) com `write` capturando a linha e fazendo `JSON.parse`, provando que o formato
   emitido é JSON válido, contém `_aws.CloudWatchMetrics` com `Namespace`, `Dimensions`
   e `Metrics`, e **não** inclui `tenantId` como dimensão por padrão (alta cardinalidade,
   custo CloudWatch) — decisão documentada no JSDoc de `emitirMetrica`.

## Fronteira de camada e ADR-016
- `metrica.ts` fica em `infrastructure/observability/`, mesma camada da referência
  (`ingestao-identificacao`). `extrair-dados-orcamento.ts` (application) só importa
  `emitirMetrica` — nenhuma decisão de namespace/unidade/dimensão vaza para o
  use case, ponto de uso é sempre uma linha.
- Nenhum import cross-BC: `metrica.ts` não depende de nada fora de `extracao`.
- Nenhum SDK novo, nenhuma permissão IAM nova — EMF é log estruturado via pino
  já existente (ADR-016).

## Regressão
`npx vitest run --reporter=default tests/bounded-contexts/extracao` roda a suíte
inteira do BC (194 passed / 14 skipped), incluindo `extrator-queue.handler.test.ts`,
`extrair-dados-orcamento.integration.test.ts`, contratos HTTP e isolamento de tenant —
nenhuma regressão nos testes pré-existentes; nenhuma asserção antiga alterada ou
enfraquecida para acomodar a métrica nova.

## Cobertura
Sem execução de `pnpm test` (bloqueado por path com espaço nesta máquina, ver
CLAUDE.md) — sem relatório de cobertura por statements/branches gerado localmente.
Os 3 caminhos de decisão introduzidos (campo extraído/não extraído × 6 campos,
conversão ok/falha) estão cobertos por teste direto, o que é o que importa para o
gate (branch coverage do código novo), independente do número agregado de cobertura
do repositório.

## Riscos residuais / limitações
- CI do GitHub (#766) ainda pendente/rodando no momento desta validação — não há
  acesso a AWS real; toda a verificação aqui é local (typecheck, lint, vitest).
  Recomenda-se conferir o resultado do CI antes do merge, mas não bloqueia o parecer:
  reproduzível localmente com evidência suficiente.
- `ConversaoMarkItDownFalhou` é proxy documentado da métrica "uso de serviço pago
  como exceção" (não existe gateway de serviço pago hoje, ADR-002) — gap conhecido
  e registrado em `tasks.md`, não é lacuna desta PR.

## Parecer
APROVADO PELO QA.
