# QA Final Report — T029 (issue #189, PR #574)

## SPEC_ID e versão testada
004-indexacao-busca-semantica-orcamentos — commit `c6fc440`, branch `feat/004-t029-indexar-orcamento`, worktree `/home/victor1090/Documentos/Labs/wt-004-t029`.

## Resumo executivo
Primeira validação do caso de uso `IndexarOrcamento`. 5 dos 6 critérios de aceite específicos passam. O critério "falha de infraestrutura deve propagar, não ser capturada" é violado: o escopo do `try/catch` no caso de uso cobre também `upsert`/`publicar` do caminho de sucesso, então uma falha de infra aí é reclassificada como `FALHA_TECNICA` em vez de propagar. Registrado como BUG-001 (ALTA). Entrega reprovada.

## Requisitos cobertos e não cobertos
1. Idempotência de retry (`buscarPorOrcamentoId`) — COBERTO, passa.
2. Invariante "só INDEXADO com embedding gerado E persistido na mesma tentativa" — parcialmente violado no caso de falha de infra durante a persistência do caminho de sucesso (ver BUG-001): o histórico pode acabar com uma tentativa `INDEXADO` fabricada seguida de `FALHA_TECNICA`, sem que a indexação tenha de fato sido persistida como bem-sucedida.
3. Falha técnica do `AgenteEmbeddingGateway` não propaga, vira `FALHA_TECNICA` com `tentativaNumero` correto — COBERTO, passa.
4. Falha de infraestrutura (`upsert`/`publicar`) deve propagar — NÃO COBERTO PELA IMPLEMENTAÇÃO. BUG-001.
5. `tenantId` obrigatório, lança `IndexarOrcamentoInvalidoError` — COBERTO, passa.
6. Eventos com `schemaVersion: 2`, `tenantId`, `orcamentoId` corretos — COBERTO (verificado por leitura de `orcamento-indexado.event.ts`/`falha-indexacao-detectada.event.ts` e teste existente).
7. Zero import cruzado entre BCs — COBERTO (apenas import de `shared-kernel/tenant/tenant-id.vo.js`; `tsc --noEmit` limpo).

## Suítes executadas e comandos
- `source ~/.nvm/nvm.sh && nvm use 24`
- `npx vitest run tests/bounded-contexts/busca-indexacao/application/indexar-orcamento.test.ts` → 6 passed antes da alteração; após adição do teste do critério 4: 6 passed + 1 failed (falha esperada, evidencia o bug).
- `npx vitest run tests/bounded-contexts/busca-indexacao` (regressão do BC) → 137 passed, 21 skipped (pré-existente, não relacionado a T029), 1 failed (o novo teste do BUG-001).
- `npx tsc --noEmit -p .` → sem erros.
- `npx eslint src/bounded-contexts/busca-indexacao/application/use-cases/indexar-orcamento.ts tests/bounded-contexts/busca-indexacao/application/indexar-orcamento.test.ts` → sem erros.

## Quantidade de testes por tipo
Unitário: 7 casos no arquivo alvo (6 do dev-back-end + 1 acrescentado pelo QA para o critério de aceite #4).

## Resultado: aprovados, falhos, ignorados e instáveis
Arquivo alvo: 6 aprovados, 1 falho (falha correta, evidencia BUG-001), 0 ignorados, 0 instáveis.
BC completo (regressão): 137 aprovados, 21 ignorados (pré-existentes, não relacionados), 1 falho (o mesmo caso acima).

## Cobertura inicial e final
Não medida via ferramenta de cobertura formal nesta rodada (gate já reprovado por defeito funcional antes da etapa de cobertura estrutural; ver Limitações). Cobertura funcional dos critérios de aceite: 5/6 cenários de negócio cobertos e passando; 1/6 cenário cobre o comportamento esperado e falha corretamente, evidenciando o defeito.

## Local do allure-results e do relatório Allure
Não gerado. O projeto não possui adaptador Allure configurado para vitest neste momento (nenhuma dependência `allure-vitest`/`allure-js-commons` encontrada em `package.json`). Registrado como limitação de ambiente/ferramental, não como falha do QA — recomenda-se ao dev-back-end/arquiteto avaliar introdução do adaptador em task de infraestrutura de testes, fora do escopo cirúrgico desta validação.

## Bugs por severidade e status
- BUG-001 (ALTA) — ABERTO.

## Riscos residuais
Enquanto BUG-001 não for corrigido, falhas transitórias de infraestrutura durante a persistência de uma indexação bem-sucedida ficam mascaradas como falha de embedding, comprometendo a confiabilidade do mecanismo de retry via DLQ (ADR-002) a ser usado pelo consumidor SQS de T030.

## Limitações do ambiente
- Allure não configurado no projeto para vitest (ver acima).
- Node do sistema é v16; suíte só roda com `nvm use 24` (conforme instruído).
- `node_modules` já presente no worktree; nenhum `npm install` foi necessário.

## Parecer final
REPROVADO — DEVOLVIDO AO DEV-BACK-END (BUG-001, severidade ALTA).
