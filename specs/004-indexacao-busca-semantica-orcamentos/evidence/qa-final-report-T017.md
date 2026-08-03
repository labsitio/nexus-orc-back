# QA Final Report — T017 (`EventBridgePublisher` implementando `EventPublisher`, busca-indexacao)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T017 (Infrastructure — instância própria do BC Busca & Indexação, mesmo bus `nexo-dominio-bus`)
- PR: #537 (labsitio/nexus-orc-back, draft, label `ready-for-qa`), branch `feat/004-t017-eventbridge-publisher-busca-indexacao`
- Commit HEAD testado: b9c88e6
- Primeira validação de QA (não é reteste de BUG)
- backend-reviewer: APPROVE (nenhum achado)

## Resumo executivo
`EventBridgePublisher` implementa `EventPublisher` (novo contrato de domínio
deste BC) publicando no bus EventBridge único `nexo-dominio-bus`, com `source`
fixo `nexo.busca-indexacao`. Implementação é cópia byte-a-byte do padrão já
aprovado em `validacao`/`extracao`/`ingestao-identificacao`, diferindo apenas na
constante `SOURCE` e nos imports do `domain-event.ts` local (que já carrega
`schemaVersion: 2` + `tenantId` obrigatório, ADR-005, herdado de T013b). Nenhum
defeito de produção encontrado.

Arquivos de produção alterados:
- `src/bounded-contexts/busca-indexacao/domain/gateways/event-publisher.ts` (novo contrato, 1 método `publicar`)
- `src/bounded-contexts/busca-indexacao/infrastructure/eventbridge.publisher.ts` (implementação)

## Testes executados
Comando: `npx vitest run --reporter=default tests/bounded-contexts/busca-indexacao`
(evitado `pnpm test` puro — incompatibilidade ambiental conhecida do allure-vitest).

1. Suíte do BC completa: 11 arquivos passando, 3 arquivos skip (integração de
   persistência que depende de Postgres real, não disponível neste ambiente de
   validação — mesma limitação já documentada em T016).
   - 69 testes passando, 21 skipped.
   - Suíte alvo isolada: `tests/bounded-contexts/busca-indexacao/infrastructure/eventbridge.publisher.test.ts` — 3/3 passando.
2. `npx tsc --noEmit` — sem erros.
3. `npx eslint` nos 3 arquivos alterados (2 produção + 1 teste) — sem findings.
4. `gh pr checks 537` — CI (build+testes) verde. Debricked (análise de
   vulnerabilidade de terceiros) pending, não bloqueante para este gate.

## Cobertura (T017)
Isolando a suíte alvo (`--coverage.include` restrito aos 2 arquivos de
produção desta task): 100% statements (7/7), 100% branches (4/4), 100%
functions (2/2), 100% lines (7/7). Os 2 ramos do guard `FailedEntryCount`
(com `ErrorMessage` e sem, usando fallback "motivo desconhecido") e o caminho
de sucesso estão cobertos pelos 3 testes já escritos pelo dev-back-end.
Nenhuma lacuna de cobertura no escopo desta task.

## Cobertura dos requisitos
Ver `specs/004-indexacao-busca-semantica-orcamentos/qa/traceability-matrix.md`
(seção "T017"). Resumo:
- Publica no bus informado, `source` fixo `nexo.busca-indexacao`, `DetailType` = `detailType` do evento: coberto.
- `Detail` serializado inclui payload completo (`orcamentoId`, `tenantId`, ADR-005): coberto.
- Falha reportada pelo EventBridge lança erro descritivo com `ErrorMessage`: coberto.
- Fallback de mensagem quando `ErrorMessage` ausente: coberto.
- Instância própria do BC, sem client/config compartilhado com outro BC: confirmado por leitura de código e diff contra o publisher de `validacao` (só difere `SOURCE`/comentários).
- Contrato `EventPublisher` do domain desacoplado do SDK AWS (nenhum tipo `@aws-sdk/*` no domain): confirmado por leitura de código.

Nenhuma lacuna de requisito do escopo de T017 identificada. Consumo do
`EventPublisher` por caso de uso/handler (wiring/composition-root) é escopo de
T018/T019, ainda não implementado — não é lacuna desta task.

## Bugs encontrados
Nenhum. Nenhum defeito de produção identificado.

## Riscos residuais
Nenhum específico de T017. Risco geral já registrado em specs anteriores desta
mesma spec (T016): dependência de enriquecimento de payload da spec 003
(T006/T045, bloqueado na issue #166) para T018 (ACL) poder montar
`ConteudoIndexavel`/`OrigemValidacao`/`tenantId` a partir dos eventos de
Validação — não afeta o publisher em si.

## Limitações do ambiente
Suíte de integração de persistência (`indice-orcamento.schema.test.ts`,
`indice-orcamento-completo.schema.test.ts`,
`drizzle-pgvector-indice-orcamento.repository.test.ts`) segue skip por
ausência de Postgres real neste ambiente de validação — não relacionado a
T017, mesma limitação documentada nos relatórios anteriores da spec (T016).

## Parecer final
APROVADO PELO QA
