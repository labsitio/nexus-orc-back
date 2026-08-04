# QA Final Report — T042 (issue #584, PR #643 draft)

## SPEC_ID / versão testada
- SPEC_ID: 007-isolamento-multitenant-dados
- Branch: `feat/584-tenantid-acl-004`
- Commit: `58a7011`
- Worktree: `/home/victor1090/Documentos/Labs/wt-584-acl-tenant`
- Comparado com: `origin/main`
- Tipo: primeira validação (não é reteste)

## Resumo executivo
`OrcamentoValidadoEventACL` passou a extrair e validar `tenantId` do envelope
publicado pelo BC validacao. Decisão de negócio implementada corretamente:
evento sem `tenantId` é rejeitado (`OrcamentoValidadoEventACLInvalidaError`);
`tenantId` com formato inválido lança `TenantIdInvalidoError` (Shared Kernel
`TenantId.de`); `tenantId` válido aparece em `resultado.tenantId` como
instância de `TenantId`. Sem regressão na suíte completa (920 passed / 99
skipped / 0 fail, idêntico à baseline do dev-back-end).

## Requisitos cobertos
- Rejeição explícita de evento sem `tenantId` — coberto e passando.
- Rejeição de `tenantId` malformado via `TenantId.de` — coberto e passando.
- `tenantId` válido presente e tipado como `TenantId` no resultado — coberto e passando.
- Não regressão do parsing estrutural pré-existente (payload/itens malformados) — coberto e passando.
- Propagação a `IndexarOrcamento` — coberto via unit test (tenantId direto) e integration test (skip local por falta de `DATABASE_URL`, esperado).

## Não cobertos / fora de escopo (conforme handoff)
- Handler SQS `indexador-queue` (T030/#190) — não implementado, fora do escopo de T042.
- Cutover de contrato tornando `tenantId` obrigatório em 003 (#632) — issue futura.

## Suítes executadas e comandos
```
source ~/.nvm/nvm.sh && nvm use 24
npx vitest run tests/bounded-contexts/busca-indexacao
npx vitest run
npx tsc --noEmit -p .
npx eslint <arquivos alterados>
```

## Resultado
- Suíte alvo (`tests/bounded-contexts/busca-indexacao`): 23 arquivos, 160 passed, 23 skipped (integração/schema sem Postgres local), 0 fail.
- Suíte completa: 157 arquivos, 920 passed, 99 skipped, 0 fail — idêntico à baseline declarada pelo dev-back-end antes da mudança.
- typecheck: 0 erros.
- lint (arquivos de produção e teste alterados): 0 erros.

## Cobertura
Não solicitada medição de cobertura numérica (statements/branches) nesta
rodada — mudança pequena e cirúrgica em arquivo já coberto; os 3 critérios de
aceite têm cenário positivo e negativo dedicados na suíte unitária
determinística (ver traceability-matrix-T042.md). Sem lacuna de risco
identificada nos caminhos alterados.

## Allure
Não configurado neste projeto até o momento (nenhum adaptador Allure presente
no runner de testes, `vitest`). Fora do escopo desta validação pontual —
registrar como item de backlog de QA se desejado, não bloqueia o gate.

## Bugs encontrados
Nenhum.

## Riscos residuais
- Enquanto 003 não preencher `tenantId` no envelope real (T041 é
  expand/contract, campo ainda opcional na origem), todo evento real será
  rejeitado por esta ACL — comportamento intencional e documentado (ADR-008,
  zero tenant real em produção hoje). Rastreado como dependência pendente na
  issue #584, não é defeito.
- Handler Lambda de indexador-queue (T030/#190) ainda não existe; T042 é
  pré-requisito dele, ordem já registrada em tasks.md (T043 é o gate de
  desbloqueio).

## Limitações do ambiente
- `DATABASE_URL` não configurado localmente nesta validação — suíte de
  integração (`indexar-orcamento.integration.test.ts`) skipada, comportamento
  esperado e documentado no próprio arquivo (CI provisiona Postgres).

## Parecer final
APROVADO PELO QA
