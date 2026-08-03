# Handoff QA → dev-back-end — T029 (issue #189, PR #574)

## SPEC_ID
004-indexacao-busca-semantica-orcamentos

## Commit/versão testada
`c6fc440` (branch `feat/004-t029-indexar-orcamento`)

## Bugs abertos por severidade

### ALTA
- **BUG-001** — Falha de infraestrutura no `upsert`/`publicar` do caminho de sucesso é engolida e reclassificada como `FALHA_TECNICA`.
  Relatório: `specs/004-indexacao-busca-semantica-orcamentos/bugs/BUG-001.md`
  Comando que reproduz:
  ```
  cd /home/victor1090/Documentos/Labs/wt-004-t029
  source ~/.nvm/nvm.sh && nvm use 24
  npx vitest run tests/bounded-contexts/busca-indexacao/application/indexar-orcamento.test.ts
  ```
  Teste relacionado: `IndexarOrcamento > falha de infraestrutura no upsert do caminho de sucesso propaga (não é reclassificada como FALHA_TECNICA)` (já adicionado ao arquivo de teste existente — não remover).

## Impacto
Falha transitória de infra (Postgres/Aurora, EventBridge) durante persistência/publicação de uma indexação bem-sucedida é mascarada como falha do modelo de embedding, corrompendo o histórico do agregado e impedindo o mecanismo de retry de infraestrutura (SQS `maxReceiveCount`/DLQ) de agir corretamente.

## Ordem recomendada de correção
1. BUG-001 (único bug aberto) — restringir o escopo do `try/catch` em `indexar-orcamento.ts` para cobrir apenas `embeddingGateway.gerarEmbedding` (e a chamada correspondente de `registrarTentativaIndexacao` para `INDEXADO`), deixando `upsert`/`publicar` do caminho de sucesso fora do bloco protegido.

## Condições para reteste
- Novo commit informado pelo dev-back-end.
- Reexecução de `tests/bounded-contexts/busca-indexacao/application/indexar-orcamento.test.ts` (suíte completa) e da suíte do BC (`tests/bounded-contexts/busca-indexacao`) para regressão.

## Nota
Nit MENOR apontado pelo `backend-reviewer` (possibilidade teórica de `TentativaIndexacaoInvalidaError` propagar do catch se `motivoFalha` fosse malformado) não bloqueia — confirmado não-crítico, na prática sempre string não vazia.
