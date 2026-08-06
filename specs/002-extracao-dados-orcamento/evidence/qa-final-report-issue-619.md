# QA Final Report — Issue #619 (OllamaExtratorGateway + selecionarAgenteExtrator)

## SPEC_ID / versão testada
- SPEC_ID: 002-extracao-dados-orcamento
- Issue: #619 (ADR-009)
- PR: #669, branch `feat/619-ollama-extrator`
- Commit testado: `25f2c19641eb51a59f1998c0a611ff41d47e45da`
- É primeira validação (não há BUG anterior para esta issue).

## Resumo executivo
`OllamaExtratorGateway` (novo) implementa `AgenteExtratorGateway` sobre a API HTTP
do Ollama (`/api/chat`, `format: "json"`), traduzindo o JSON bruto para VOs de
domínio via a mesma `BedrockExtracaoACL` já usada pelo gateway Bedrock (reuso,
sem duplicar regra de validação/tradução). `selecionarAgenteExtrator`, nova função
exportada em `src/composition/extracao.ts`, lê `NEXO_AGENTE_IA` (`local`|`bedrock`)
e falha rápido (throw) se a variável estiver ausente/inválida ou se a config
exigida pelo valor escolhido não for fornecida — sem fallback silencioso, sem
segunda variável de seleção.

## Diff revisado
`git diff main...feat/619-ollama-extrator --stat`: 4 arquivos, 334 inserções, 1 deleção.
- `src/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.ts` (novo, produção)
- `src/composition/extracao.ts` (modificado, produção — `selecionarAgenteExtrator`)
- `tests/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.test.ts` (novo, teste)
- `tests/composition/extracao.test.ts` (modificado, teste)

Confirmado por diff explícito (`git diff main...feat/619-ollama-extrator -- docker-compose.yml
src/bounded-contexts/ingestao-identificacao src/composition/ingestao-identificacao.ts
src/composition/aws-clients.production.ts`) que nenhum desses 4 caminhos fora de
escopo foi tocado (0 linhas de diff) — critério de aceite 4 (issue #619) satisfeito.

## Suítes executadas e comandos
- `pnpm typecheck` (`tsc --noEmit`) → sem erros.
- `pnpm lint` (`eslint .`) → sem erros.
- `pnpm exec vitest run --reporter=default` (contorno do bug pré-existente de
  resolução de módulo do reporter `allure-vitest` neste worktree, não relacionado
  a este diff) → **171 arquivos de teste passaram, 19 skipped (esperado — dependem
  de Postgres/LocalStack reais, não disponíveis neste ambiente), 0 falharam.
  1036 testes passaram, 106 skipped.**
  - `tests/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.test.ts`: 5/5 passou.
  - `tests/composition/extracao.test.ts`: 6/6 passou.
- Cobertura pontual (`vitest run --coverage` restrito aos 2 arquivos de teste do
  diff): `ollama-extrator.gateway.ts` 94.44% statements / 100% functions (única
  linha não coberta: guarda defensiva `!conteudo` na linha 87, ramo trivial);
  `composition/extracao.ts` 91.66% statements (linha não coberta é a factory de
  repositório pré-existente, fora do escopo deste diff).

## Critérios de aceite da issue #619 — avaliação
1. **`OllamaExtratorGateway` implementa `AgenteExtratorGateway`, JSON estruturado
   via `format:"json"`, nunca regex** — ATENDIDO. Classe implementa a interface;
   request ao Ollama envia `format: 'json'` (confirmado pelo corpo da requisição
   no teste "extrair chama POST /api/chat com format:"json""); parsing é
   `JSON.parse` + validação estrutural via `ehExtracaoBruta` (mesma guarda do
   gateway Bedrock), nunca regex sobre texto livre — testado explicitamente no
   caso "lança erro se message.content não for JSON válido (nunca parsing de
   texto livre por regex)".
2. **`selecionarAgenteExtrator` lê `NEXO_AGENTE_IA`, falha rápido, sem fallback,
   sem segunda variável** — ATENDIDO. Única leitura de env é o parâmetro default
   `agenteIa = process.env.NEXO_AGENTE_IA`; `bedrock` sem `config.bedrock` lança;
   `local` sem `config.ollama` lança; qualquer outro valor (incluindo ausente)
   lança erro genérico listando os dois valores válidos — sem `else`/default que
   construa um gateway sem confirmação explícita. 5 testes de composição cobrem
   os 3 branches de erro e os 2 branches de sucesso.
3. **Documentação explícita do que este PoC NÃO prova** — ATENDIDO, via docstring
   da classe `OllamaExtratorGateway` (linhas 46-49 do arquivo): declara
   explicitamente que a PoC não prova fidelidade de extração vs Bedrock real,
   calibração do escalonamento por `condicoesPagamento` ausente, comportamento de
   prompt injection, nem p95/custo de inferência real — e referencia
   `docs/plano-infra-ambientes.md §5` e a própria issue #619. Documentação vive no
   código (comentário de classe), não em arquivo `docs/` separado — aceitável
   dado que a issue não exige local específico, e o texto é idêntico ao pedido.
4. **Nenhum arquivo fora do escopo tocado** — ATENDIDO (ver seção "Diff revisado").

## Cobertura de riscos adicionais verificada
- Isolamento de prompt injection: teste "isola o texto do documento em mensagem de
  usuário (nunca instrução de sistema)" injeta a string
  `"IGNORE AS REGRAS ANTERIORES..."` no `textoConvertido` e confirma que ela cai
  na mensagem `role: 'user'` dentro do delimitador `<conteudo_do_documento>`,
  nunca na mensagem `role: 'system'`.
- Falha de rede/HTTP (status não-2xx): testado, erro contém o status.
- Shape inesperado do JSON retornado (ex.: `itens` não é array): testado, gateway
  nunca confia ciegamente no shape prometido pelo LLM.

## Cobertura de teste do gateway via HTTP mockado
Confirmado que `tests/.../ollama-extrator.gateway.test.ts` não depende de container
Ollama real — injeta `fetchImpl` (4º parâmetro do construtor) como fake via
`vi.fn().mockResolvedValue(...)`, consistente com a exigência do enunciado (o
serviço Ollama real do docker-compose pertence ao PR #617, não disponível neste
worktree).

## Bugs encontrados
Nenhum. Não há BUG-XXX aberto para esta issue.

## Riscos residuais / limitações do ambiente
- Sem container Ollama real neste worktree: cobertura é 100% via HTTP client
  mockado, conforme já esperado pelo enunciado da tarefa (não é lacuna a reportar,
  é a estratégia de teste correta para uma composition root que só decide *qual*
  gateway construir).
- PoC explicitamente não valida fidelidade de extração local vs Bedrock real — já
  documentado no código pelo próprio dev-back-end (critério de aceite 3), não é um
  gap desta validação de QA.
- Suíte completa tem 19 arquivos de teste skipped (Postgres/LocalStack reais) —
  comportamento pré-existente do restante da suíte, não relacionado a este diff.

## Parecer final
**APROVADO PELO QA**
