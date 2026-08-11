# QA Final Report — Issue #740 (`prazoValidade` resolvido deterministicamente na ACL — ADR-015)

## SPEC_ID / versão testada
- SPEC_ID: 002-extracao-dados-orcamento
- Issue: #740
- PR: #742, branch `worktree-agent-aaf04a354b0c7f2b2`
- Commit testado: `2f5f681`
- É primeira validação (não há BUG anterior para esta issue).

## Resumo executivo
`bedrock-extracao.acl.ts` fazia `PeriodoValidade.de(new Date(v))` direto sobre
texto lido pelo LLM: `"30 dias"` gerava `Invalid Date` → `PeriodoValidadeInvalidoError`,
quebrando a extração inteira mesmo quando o modelo lia o texto corretamente. O
fix introduz `resolverPrazoValidade(texto, referencia)`, função pura com 3
caminhos ordenados: (1) data absoluta — ISO `^\d{4}-\d{2}-\d{2}` ou `dd/mm/yyyy`
via regex explícita, nunca `new Date(string)` cru; (2) período relativo
dia/semana/mês/ano — dias/semanas por soma simples, meses/anos por `somarMeses`
seguindo art. 132 §3 do Código Civil (nunca `setMonth` puro); (3) residual →
`undefined` → `naoExtraido`. `paraCampoExtraido` passa a aceitar construtor que
devolve `undefined`. `PeriodoValidade` (VO) não foi alterado.

## Diff revisado
`git diff main --stat` (4 arquivos, 216 inserções, 5 deleções):
- `src/bounded-contexts/extracao/infrastructure/bedrock-extracao.acl.ts` (produção)
- `src/bounded-contexts/extracao/infrastructure/bedrock-extrator.gateway.ts` (produção — só descrição do campo no schema)
- `src/bounded-contexts/extracao/infrastructure/ollama-extrator.gateway.ts` (produção — só descrição do campo no schema)
- `tests/bounded-contexts/extracao/infrastructure/bedrock-extracao.acl.test.ts` (teste, produzido pelo dev-back-end)

Confirmado por leitura completa: `periodo-validade.vo.ts` não sofreu diff
(critério de aceite 5 — persistência e payload ISO 8601 intactos). Nenhum
arquivo fora do escopo declarado na issue foi tocado.

## Suítes executadas e comandos
- `pnpm typecheck` → sem erros.
- `pnpm lint` → sem erros.
- `DATABASE_URL=postgresql://nexo:nexo@localhost:5433/nexo npx vitest run --reporter=default tests/bounded-contexts/extracao/infrastructure/bedrock-extracao.acl.test.ts` → **26/26 passou.**
- `DATABASE_URL=postgresql://nexo:nexo@localhost:5433/nexo npx vitest run --reporter=default` (suíte completa, Postgres real disponível) → **213/213 arquivos, 1380/1380 testes passaram, 0 falha.**
- `tests/bounded-contexts/validacao/infrastructure/persistence/drizzle-faixa-preco.repository.test.ts` (mencionado como risco conhecido de dado manual residual `ACO`) executado isoladamente → **5/5 passou**, sem falha a reportar.
- CI do PR #742: `ci` = SUCCESS.

## Critérios de aceite da issue #740 — avaliação
1. **`"30 dias"` com confiança 100 resulta em extração bem-sucedida** — ATENDIDO. Teste `resolve extração bem-sucedida (não PeriodoValidadeInvalidoError) para o payload real que quebrava — prazoValidade "30 dias"`.
2. **`"2026-09-10"` e `"10/09/2026"` resolvem para 10 de setembro de 2026, nunca 9 de outubro** — ATENDIDO. `it.each` cobre ambos os formatos; teste dedicado `ARMADILHA: "10/09/2026" nunca resolve para 9 de outubro` assere explicitamente a negativa (`not.toBe('2026-10-09')`).
3. **Aritmética de mês pelo Código Civil (não `setMonth`)** — ATENDIDO. `it.each` cobre os 3 casos exigidos: `31/01/2026 + 1 mês = 2026-03-01`, `30/01/2026 + 1 mês = 2026-03-01`, `30/11/2026 + 3 meses = 2027-03-01` — todos batendo o resultado exato, nunca dia 02/03.
4. **Degradação para `naoExtraido` sem lançar erro, e regra pré-existente de status não-`EXTRAIDO`** — ATENDIDO. `"válido enquanto durar o estoque"` e `"validade indeterminada"` testados via `it.each` (`resolverPrazoValidade` retorna `undefined`) e via teste de integração da ACL (`degrada prazoValidade não reconhecido para naoExtraido`). A regra de status (`extrair-dados-orcamento.integration.test.ts`, não tocada por este diff) continua verde, confirmando que campo `naoExtraido` mantém o agregado fora de `EXTRAIDO`.
5. **`PeriodoValidade` (VO) não alterado** — ATENDIDO. Confirmado por ausência de diff em `periodo-validade.vo.ts`; `PeriodoValidade.de`/`paraPayload()` (ISO 8601) intactos.
6. **`"2026-02-30"` rejeitado (residual), sem overflow silencioso** — ATENDIDO. Teste dedicado `rejeita data ISO de calendário inexistente ("2026-02-30")`.

## Cobertura
Não há gap: todos os 6 critérios de aceite têm cenário direto no
`bedrock-extracao.acl.test.ts` (26 testes, 15 novos nesta PR). Branches de
`resolverDataAbsoluta` (ISO válido/inválido, BR válido, residual sem match),
`resolverPeriodoRelativo` (dia/semana/mês/ano) e `somarMeses` (overflow e
não-overflow, cruzando ano) estão todos exercitados por `it.each`. Não
identifiquei caso relevante faltando — não escrevi teste adicional (YAGNI:
cobertura já atende a superfície de risco da issue).

## Bugs encontrados
Nenhum.

## Riscos residuais
- `art. 132 §1` do Código Civil (prorrogação em feriado) fora de escopo,
  declarado deliberadamente pelo dev-back-end (calendário de feriados
  inexistente no repo) — risco aceito, não é regressão.
- `referencia` da resolução é sempre `new Date()` (data de processamento, não
  data de emissão real da proposta) — gap pré-existente #160/T050 em outro BC,
  não introduzido por esta issue.
- `resolverDataAbsoluta` não tem teste dedicado para `dd/mm/yyyy` de calendário
  inexistente (só o caminho ISO tem o teste explícito do critério 6); a lógica
  de round-trip é idêntica entre os dois caminhos, risco residual baixo.
- ADR-015, citado nos comentários do código (`bedrock-extracao.acl.ts`), não
  foi localizado como documento em `docs/architecture-diagrams/`. Lacuna de
  documentação a reportar ao arquiteto-back, não bloqueia este gate de QA.

## Limitações do ambiente
Nenhuma. Postgres real disponível (reaproveitado de outro worktree, mapeado em
`localhost:5433`) — suíte completa rodou sem `skipIf`.

## Parecer final
**APROVADO PELO QA.**
