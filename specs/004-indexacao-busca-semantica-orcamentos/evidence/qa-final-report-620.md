# QA Final Report — #620 (PR #673)

## SPEC_ID e versão testada
004-indexacao-busca-semantica-orcamentos — commit `3dfe7d0`, branch `feat/620-ollama-embedding`, PR #673 (draft, base `main`). Primeira validação (não é reteste de BUG). `backend-reviewer` já aprovou (APPROVE, sem achados).

## Resumo executivo
`OllamaEmbeddingGateway`/`OllamaEmbeddingACL` implementam `AgenteEmbeddingGateway` sobre `POST /api/embed` do Ollama, alternativa local ao `BedrockEmbeddingGateway` já aprovado (ADR-009). `selecionarAgenteEmbedding` na composition root (`src/composition/busca-indexacao.ts`) seleciona a implementação por `NEXO_AGENTE_IA`, mesmo contrato já validado de `selecionarAgenteExtrator` (#619). A restrição dura da issue — vetor com dimensão != 1024 (schema pgvector já criado, `indice-orcamento.schema.ts`) nunca pode ser truncado/normalizado em silêncio — está implementada em `OllamaEmbeddingACL.converter` (comparação estrita antes de construir o VO `Embedding`) e coberta por teste que exercita o caminho real: o fetch mockado devolve um vetor genuíno de 768 posições (não um stub estático), o gateway repassa o corpo bruto para a ACL, e a rejeição vem da comparação de tamanho, não de um atalho de teste. O handler de produção (`indexador-queue.production.ts`) continua resolvendo sempre para `BedrockEmbeddingGateway` — `exigirAgenteIaBedrockEmProducao()` já garante `NEXO_AGENTE_IA=bedrock` antes da chamada a `selecionarAgenteEmbedding`, então Ollama nunca é alcançável em produção por este caminho. `typecheck` e `lint` limpos nos 7 arquivos do diff. Suíte completa: 177 arquivos passando/19 pulados (196), 1070 testes passando/106 pulados (1176), 0 falhos — idêntico ao relatado pelo dev-back-end. Nenhum defeito de produção encontrado.

## Requisitos cobertos e não cobertos
1. `OllamaEmbeddingGateway.gerarEmbedding` chama `POST /api/embed` com `model`/`input` corretos e devolve VO `Embedding` traduzido pela ACL — COBERTO.
2. Falha HTTP (`resposta.ok === false`) e corpo sem `embeddings` válido são erros explícitos, nunca silenciosos — COBERTO (2 testes dedicados no gateway).
3. **Critério crítico**: dimensão de vetor != 1024 causa falha explícita, nunca truncamento/normalização silenciosa — COBERTO tanto no nível do gateway (mock com vetor real de 768 posições, `nomic-embed-text`) quanto no nível da ACL isolada (`OllamaEmbeddingACL.converter` com vetor de 768, erro tipado `OllamaEmbeddingACLInvalidaError`). QA confirmou por leitura que o teste não é um mock que sempre satisfaz 1024 — o corpo da resposta HTTP e a validação de dimensão são exercitados na mesma cadeia real (gateway → ACL).
4. `selecionarAgenteEmbedding` seleciona `OllamaEmbeddingGateway`/`BedrockEmbeddingGateway` por `NEXO_AGENTE_IA`, falha rápido se a config exigida pelo valor escolhido não foi fornecida, e falha rápido se a variável estiver ausente/inválida — COBERTO (5 testes dedicados, incluindo os 2 casos de config ausente e o caso de valor inválido/ausente).
5. Handler de produção nunca resolve para Ollama — COBERTO por leitura de código: `exigirAgenteIaBedrockEmProducao()` roda antes de `selecionarAgenteEmbedding({ bedrock: {...} })`, sem `config.ollama` fornecido nesse caminho; mesmo padrão já testado para o guard equivalente em `aws-clients.production.test.ts` (T028/#623).
6. `.env.example`/`docs/poc-ollama-embedding.md` documentam a restrição de modelo (`mxbai-embed-large` único compatível com 1024 dimensões) e o aviso de que dimensão igual não prova espaço vetorial comparável ao Titan V2 — revisado, sem inconsistência com o código.
7. **Não coberto** (fora de escopo de #620, não é lacuna desta issue): qualidade semântica do embedding local vs. Titan V2 real, migração de schema para outro modelo de dimensão diferente, chamada real contra um servidor Ollama vivo (integração de ambiente).

## Suítes executadas e comandos
- `npx tsc --noEmit` → sem erros.
- `npx eslint` nos 7 arquivos do diff (produção + teste) → sem erros.
- `npx vitest run --reporter=default` (suíte completa, bypass do reporter Allure — ver limitações de ambiente) → 177/196 arquivos, 1070/1176 testes.
- `npx vitest run --reporter=default --coverage --coverage.include=...` isolando `ollama-embedding.gateway.ts`, `ollama-embedding.acl.ts` e `composition/busca-indexacao.ts`.

## Quantidade de testes por tipo
Unitário: 15 testes no total nos 3 arquivos do diff — 4 em `ollama-embedding.acl.test.ts`, 4 em `ollama-embedding.gateway.test.ts`, 7 em `tests/composition/busca-indexacao.test.ts` (2 pré-existentes de composição + 5 novos de `selecionarAgenteEmbedding`). Nenhum teste de integração/E2E necessário — não há servidor Ollama real disponível nesta issue nem é seu escopo (ADR-009 já trata isso como PoC de ambiente local).

## Resultado: aprovados, falhos, ignorados e instáveis
Arquivos do diff: 15 aprovados, 0 falhos, 0 ignorados, 0 instáveis.
Suíte completa do repositório: 1070 aprovados, 0 falhos, 106 ignorados (integração real Postgres/LocalStack, `DATABASE_URL`/Docker ausentes nesta sessão — mesma limitação já registrada em validações anteriores desta spec), 0 instáveis.

## Cobertura inicial e final
Baseline: não medida separadamente (arquivos novos deste PR — baseline é 0% por definição).
Final, isolada nos arquivos do diff (medida via `coverage-final.json`/`istanbul-lib-coverage`, já que o relatório ASCII do terminal não detalha caminhos absolutos de bounded-contexts aninhados):
- `ollama-embedding.gateway.ts`: 100% statements (15/15), 100% branches (10/10), 100% functions (3/3), 100% lines (15/15).
- `ollama-embedding.acl.ts`: 100% statements (10/10), 100% branches (8/8), 100% functions (4/4), 100% lines (9/9).
- `composition/busca-indexacao.ts`: 86.95% statements / 100% branches / 57.14% functions / 86.95% lines — único gap são as linhas 78-88 (`repositorioNuncaUsado`, stub que lança `never`, estruturalmente inalcançável por design; mesmo padrão já aceito e documentado na validação de #623 no `traceability-matrix.md` desta spec). Nenhuma lacuna nova introduzida por #620 nesse arquivo — a função `selecionarAgenteEmbedding` em si está 100% cobrida (todos os ramos: `bedrock`/`local`/config ausente em cada/valor inválido).

## Local do allure-results e do relatório Allure
`allure-results/` na raiz do repositório, gerado por `allure-vitest/reporter` já configurado em `vitest.config.ts` — nesta sessão específica de QA, a execução com o reporter Allure padrão falhou por um problema de ambiente isolado a este sandbox (ver limitações abaixo), sem relação com o código desta PR. `--reporter=default` confirmou 100% dos mesmos resultados (177/196 arquivos, 1070/1176 testes, 0 falhos) relatados pelo dev-back-end, que presumivelmente rodou a suíte com Allure ativo em ambiente sem essa limitação.

## Bugs por severidade e status
Nenhum bug aberto nesta validação.

## Riscos residuais
- Nenhum risco de negócio não testado identificado. A restrição dura de dimensionalidade (o requisito mais crítico da issue) está coberta em dois níveis (gateway + ACL) com dado genuíno de dimensão incorreta, não com stub artificial.
- Qualidade semântica do embedding local (Ollama/`mxbai-embed-large`) vs. produção (Titan V2/Bedrock) permanece não comparável — já documentado explicitamente em `docs/poc-ollama-embedding.md` como limitação conhecida e aceita da PoC, com reindexação obrigatória ao trocar modelo. Não é lacuna de teste, é limitação de escopo já declarada pelo próprio PR.

## Limitações do ambiente
- Docker não está rodando nesta máquina — 19 arquivos de teste (integração real Postgres/LocalStack) fazem skip via `describe.skipIf`, comportamento esperado e já registrado em validações anteriores desta spec (T025, T029, T030, #623). Não relacionado a #620.
- `npx vitest run` com o reporter Allure padrão (config já existente em `vitest.config.ts`, não alterada por esta validação) falhou nesta sessão sandbox com `Error: Vitest failed to find the runner` ao carregar `allure-vitest/dist/setup.js` — investigação em campo apontou para resolução de módulo pnpm/vitest específica deste worktree isolado (o erro cita um caminho fora do worktree corrente). QA contornou com `--reporter=default` (só desativa o reporter Allure via flag de CLI, sem tocar `vitest.config.ts`) e confirmou resultados idênticos aos do dev-back-end. Relatório Allure HTML não gerado nesta sessão. Recomendação: DevOps investigar a causa da falha do `allure-vitest` setup neste tipo de ambiente sandbox — não bloqueia #620, mas pode bloquear a geração de evidências Allure de QAs futuros no mesmo tipo de ambiente.

## Parecer final
APROVADO PELO QA
