# QA Final Report — Issue #735 (JSON Schema real no `format` do OllamaExtratorGateway)

## SPEC_ID / versão testada
- SPEC_ID: 002-extracao-dados-orcamento
- Issue: #735
- PR: #739, branch `worktree-agent-a4b223242aec47713`
- Commit testado: `bae719236e9608d6f8e0b908abb6eb6667180fb2`
- É primeira validação (não há BUG anterior para esta issue).

## Resumo executivo
`OllamaExtratorGateway` trocou `format: 'json'` (JSON mode livre do Ollama) por
`format: SCHEMA_EXTRACAO`, um JSON Schema real que espelha a profundidade do
`inputSchema` de tool-use do `bedrock-extrator.gateway.ts`: `CampoBruto`
aninhado (`valor`/`confianca`), `type: ['object'|'number'|'string', 'null']`
para expressar "não extraído", `pattern: '^[A-Z]{3}$'` para moeda ISO-4217.
`INSTRUCAO_SISTEMA` foi reduzida — shape em prosa removido (redundante com o
schema) — mantendo só regra de negócio real: proibição de inventar valor,
exigência de ISO-4217, e reforço de que `descricao.valor` é objeto (issue cita
lição da PR #732: schema só não resolve ambiguidade de nome de campo).

## Diff revisado
`git show bae7192 --stat`: 2 arquivos, 157 inserções, 31 deleções.
- `src/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.ts` (modificado, produção)
- `tests/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.test.ts` (modificado, teste)

Confirmado por leitura do diff completo que nenhum arquivo fora do escopo
declarado na issue (`bedrock-extracao.acl.ts`, `bedrock-extrator.gateway.ts`,
VOs `Dinheiro`, `src/bounded-contexts/orquestracao/**`, `infra/`, `drizzle/`,
`src/interface/shared/`, `src/dev/`) foi tocado.

## Suítes executadas e comandos
- `npx tsc --noEmit` → sem erros.
- `npx eslint src/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.ts tests/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.test.ts` → sem erros.
- `npx vitest run --reporter=default tests/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.test.ts` → **5/5 passou.**
- `DATABASE_URL=postgresql://nexo:nexo@localhost:5433/nexo npx vitest run --reporter=default` (suíte completa, Postgres real disponível) →
  **212/213 arquivos passaram, 1364/1364 testes passaram.** O único arquivo
  marcado como falho na primeira execução
  (`tests/security/isolamento-multitenant/busca-indexacao.test.ts`, BC
  `busca-indexacao`, não tocado por este PR) falhou por corrida de concorrência
  no teardown do Postgres (`error: tuple concurrently updated`) — reexecutado
  isoladamente, passou 4/4. Classificado como falha pré-existente de ambiente
  (concorrência de suíte), não relacionada ao diff — corroborado pelo CI do PR
  (`ci` = SUCCESS, `statusCheckRollup`).
- CI do PR #739: `ci` SUCCESS (2026-08-11T05:32:00Z).

## Critérios de aceite da issue #735 — avaliação
1. **Teste com mock HTTP confirma que `format` enviado é o schema, não a string
   `'json'`, e carrega a profundidade esperada** — ATENDIDO. Teste
   `extrair chama POST /api/chat com JSON Schema real em format (não "json"
   livre)...` assere `typeof format === 'object'`, `format.type === 'object'`,
   `format.required === ['itens', 'condicoesComerciais']`, tipo `['object',
   'null']` em `descricao.valor` com `sku` presente, e `pattern: '^[A-Z]{3}$'`
   em `moeda`. Comparado byte a byte contra `bedrock-extrator.gateway.ts` —
   mesma estrutura de `campoExtraidoSchema`, mesmos 3 campos de item, mesmos 3
   campos de `condicoesComerciais`, mesmo pattern de moeda.
2. **Teste de shape inválido continua rejeitando** — ATENDIDO. Teste
   `lança erro se o JSON retornado não tiver o shape esperado (nunca confia
   cegamente no LLM)` inalterado no diff, passa; guarda `ehExtracaoBruta`
   (issue #734, não tocada aqui) continua sendo a defesa final.
3. **Validação contra o modelo real (desejável)** — EXECUTADA. Chamada real ao
   container `ollama` (`llama3.1`, `http://localhost:11434`) com texto de
   orçamento fabricado (`Chapa de aço carbono 2mm, SKU CH-2MM-100, ... preço
   unitário R$ 120,00`). Resultado após tradução pela ACL:
   ```json
   {
     "descricaoValor": {
       "valor": { "descricao": "Chapa de aço carbono", "sku": "CH-2MM-100" },
       "confianca": { "valor": 100 }
     },
     "precoUnitario": {
       "valor": { "valorCentavos": 120000, "moeda": "BRL" },
       "confianca": { "valor": 90 }
     }
   }
   ```
   `descricao.valor` chegou como objeto `{descricao, sku}` (não string —
   comportamento que o JSON mode livre quebrava, conforme relatado na issue) e
   `moeda` chegou como `"BRL"` (ISO-4217), não `"R$"`. Confirma o fix na prática,
   não só no mock.

## Cobertura
Não coletada por arquivo isolado nesta rodada — arquivo de produção já cobria
94%+ statements na PR base (#669) e o diff atual não introduz caminho de código
sem teste correspondente (schema é dado estático, exercitado pelo teste 1; guard
de shape inválido é o teste 5, inalterado). Sem regressão de cobertura
identificada.

## Bugs encontrados
Nenhum.

## Riscos residuais
- Comportamento do modelo local (`llama3.1`) segue não determinístico entre
  execuções — a validação real acima é evidência pontual, não uma garantia
  estatística; a defesa estrutural (`ehExtracaoBruta`) é o que efetivamente
  protege o domínio de shape divergente em produção local.
- `format: <JSON Schema>` no Ollama depende de versão >= 0.5 (container roda
  0.32.6, conforme já registrado na issue) — não testado contra versões
  anteriores, fora do escopo desta PR.

## Limitações do ambiente
Nenhuma. Postgres e Ollama (com `llama3.1` já puxado) disponíveis localmente.

## Parecer final
**APROVADO PELO QA.**
