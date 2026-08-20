# QA Final Report — #746 (PR #749)

## SPEC_ID e versão testada
004-indexacao-busca-semantica-orcamentos — commit `dec58cf`, branch `feat/746-ollama-interpretador-consulta`, PR #749 (base `main`). Follow-up de paridade ADR-009, sem T-number dedicado em `tasks.md` (BC busca-indexacao). Primeira validação (não é reteste de BUG).

## Resumo executivo
`OllamaInterpretadorConsultaGateway` implementa `AgenteInterpretadorConsultaGateway` sobre `POST /api/chat` do Ollama, alternativa local ao `BedrockInterpretadorConsultaGateway` (T037, já aprovado) — fecha o último gap de paridade ADR-009 entre as 5 portas de IA do repositório. `selecionarAgenteInterpretador` na composition root (`src/composition/busca-indexacao.ts`) segue exatamente o contrato já validado de `selecionarAgenteEmbedding`/`selecionarAgenteExtrator`. A tradução do JSON bruto do LLM para `CriterioBusca` é delegada à `BedrockInterpretacaoConsultaACL` já validada em T033 (agnóstica de qual modelo produziu o shape) — inclusive a rejeição de categoria fora do catálogo mesmo que o modelo burle o `enum` do JSON Schema. `src/dev/local.ts` passou a usar o seletor real e um `catalogoCategorias` real (lido de `faixas_preco_categoria` no boot), removendo o stub que sempre devolvia a consulta inteira como texto livre. `typecheck`/`lint` limpos. Suíte completa: 198 arquivos passando/19 pulados, 1290 testes passando/110 pulados, 0 falhos (3 arquivos de infra com timeout de hook sob carga cheia da suíte, confirmados como flaky pré-existente e não relacionado a este diff — reexecutados isolados, passaram). QA adicionou 1 teste fechando o único ramo não coberto do gateway (ausência de `message.content`), elevando `ollama-interpretador-consulta.gateway.ts` a 100% em todas as métricas. Nenhum defeito de produção encontrado.

## Requisitos cobertos e não cobertos
1. Gateway chama `POST /api/chat` com `format` = JSON Schema real (nunca `format: 'json'` livre), `enum` de `categoria` restrito ao `catalogoCategorias` da chamada — COBERTO.
2. Consulta do usuário isolada em bloco delimitado na mensagem de usuário, nunca concatenada à instrução de sistema (mitigação de prompt injection) — COBERTO com caso de teste contendo tentativa de injeção explícita.
3. Falha HTTP, `message.content` ausente, JSON sintaticamente inválido e shape fora do esperado são todos erros explícitos, nunca silenciosos — COBERTO (4 cenários dedicados, 1 adicionado pelo QA).
4. **Defesa em profundidade**: categoria fora do catálogo rejeitada pela ACL mesmo que o modelo burle o `enum` do schema — COBERTO.
5. `selecionarAgenteInterpretador` seleciona a implementação por `NEXO_AGENTE_IA`, falha rápido se a config exigida pelo valor escolhido não foi fornecida, e falha rápido se a variável estiver ausente/inválida — COBERTO (5 testes, simétricos aos já aprovados de `selecionarAgenteEmbedding`).
6. `src/dev/local.ts` usa o seletor real e `catalogoCategorias` real (não mais vazio/stub) — COBERTO por leitura de código; confirmado que `validacao.gatewayFaixaPreco` já está construído antes do ponto de leitura (ordem de inicialização correta).
7. `docs/poc-ollama-interpretador-consulta.md` documenta validação manual contra Ollama real (`llama3.1`) — revisado, consistente com os testes automatizados, sem alegação de comportamento não coberto.
8. **Não coberto** (fora de escopo de #746, não é lacuna desta issue): wiring de rota HTTP de produção para este BC (`registrarRotaBuscaOrcamentos` só é chamado em `src/dev/local.ts`); fidelidade da interpretação comparada ao Bedrock real em produção; interpretação de data relativa (já registrado como limite conhecido no PoC); comportamento de prompt injection contra modelo real (bloqueado por falta de credencial AWS, issue #259).

## Suítes executadas e comandos
- `npx tsc --noEmit` → sem erros.
- `npx eslint .` → sem erros.
- `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao/infrastructure/ollama-interpretador-consulta.gateway.test.ts tests/composition/busca-indexacao.test.ts` → 19/19 passando (7 + 12, após o teste adicionado pelo QA).
- `npx vitest run --reporter=default` (suíte completa) → 198/217 arquivos, 1290/1400 testes.
- `npx vitest run --reporter=default --coverage --coverage.include=...` isolando `ollama-interpretador-consulta.gateway.ts` e `composition/busca-indexacao.ts`.
- `pnpm audit` → sem vulnerabilidades conhecidas (confirma o bump `nanoid ^3.3.18`).

## Quantidade de testes por tipo
Unitário: 7 testes em `ollama-interpretador-consulta.gateway.test.ts` (6 do dev-back-end + 1 adicionado pelo QA), 5 testes novos em `tests/composition/busca-indexacao.test.ts` (`selecionarAgenteInterpretador`, simétricos aos 5 já existentes de `selecionarAgenteEmbedding`). Nenhum teste de integração/E2E necessário — não há servidor Ollama real disponível nesta issue nem é seu escopo (mesmo padrão das issues irmãs #619/#620/#621).

## Resultado: aprovados, falhos, ignorados e instáveis
Arquivos do diff: 19 aprovados, 0 falhos, 0 ignorados, 0 instáveis.
Suíte completa do repositório: 1290 aprovados, 0 falhos, 110 ignorados (integração real Postgres/LocalStack, `DATABASE_URL`/Docker ausentes nesta sessão — mesma limitação já registrada em validações anteriores desta spec), 0 instáveis nos arquivos do diff. 3 arquivos de `infra/lib/*-stack.test.ts` (CDK synth) falharam por timeout de hook (30s) na rodada de suíte completa sob carga; reexecutados isolados, passaram em 23-24s cada — flakiness pré-existente de ambiente (CDK synth é lento sob carga concorrente), sem relação com este diff (nenhum arquivo de `infra/` alterado por #746).

## Cobertura inicial e final
Baseline (arquivos novos deste PR, medida antes do teste adicionado pelo QA): `ollama-interpretador-consulta.gateway.ts` 95% statements/lines, 87.5% branches, 100% functions — gap no guard `!conteudo` (ausência de `message.content`), nunca exercitado pelos 6 testes originais.
Final, isolada nos arquivos do diff:
- `ollama-interpretador-consulta.gateway.ts`: 100% statements, 100% branches, 100% functions, 100% lines (após o teste adicionado pelo QA).
- `composition/busca-indexacao.ts`: 90.62% statements / 100% branches / 62.5% functions / 90.62% lines — único gap são as linhas 117-127 (`repositorioNuncaUsado`, stub que lança `never`, estruturalmente inalcançável por design; mesmo padrão já aceito e documentado nas validações de #623/#620 no `traceability-matrix.md` desta spec). `selecionarAgenteInterpretador` em si está 100% coberta em todos os ramos (bedrock/local/config ausente em cada/valor inválido).

## Local do allure-results e do relatório Allure
`allure-results/` na raiz do repositório, via `allure-vitest/reporter` já configurado em `vitest.config.ts`. Nesta sessão de QA, `--reporter=default` foi usado por limitação de ambiente conhecida (path com espaço quebra o reporter Allure neste worktree Windows — ver `CLAUDE.md`), sem alterar `vitest.config.ts`. Resultados confirmados idênticos aos esperados; relatório Allure HTML não gerado nesta sessão específica.

## Bugs por severidade e status
Nenhum bug aberto nesta validação.

## Riscos residuais
- Nenhum risco de negócio não testado identificado nos arquivos do diff. O critério mais sensível da issue (defesa em profundidade contra categoria fora do catálogo mesmo com `enum` no schema) está coberto tanto no gateway quanto reaproveitando a ACL já validada em T033.
- Wiring de rota HTTP de produção para `BuscarOrcamentos`/`AgenteInterpretadorConsultaGateway` ainda não existe (só `src/dev/local.ts` consome o seletor) — não é lacuna desta issue, escopo explicitamente restrito a gateway + seletor conforme `docs/poc-ollama-interpretador-consulta.md`.
- Fidelidade semântica da interpretação local (Ollama/`llama3.1`) vs. produção (Bedrock) permanece não comparável — já documentado como limitação conhecida e aceita da PoC.

## Limitações do ambiente
- Docker não confirmado rodando nesta sessão — 19 arquivos de teste (integração real Postgres/LocalStack) fazem skip via `describe.skipIf`, comportamento esperado e já registrado em validações anteriores desta spec.
- `pnpm test` (reporter Allure padrão) quebra neste worktree por path com espaço (`allure-vitest` "Vitest failed to find the runner") — contornado com `--reporter=default`, sem alterar `vitest.config.ts`, conforme já documentado em `CLAUDE.md`.
- 3 arquivos de `infra/lib/*-stack.test.ts` (CDK synth) apresentaram timeout de hook (30s) sob carga cheia da suíte completa; reexecutados isolados, passaram normalmente — recomendação: DevOps avaliar aumento do `hookTimeout` desses testes de síntese CDK ou isolar sua execução, fora do escopo de #746.

## Parecer final
APROVADO PELO QA
