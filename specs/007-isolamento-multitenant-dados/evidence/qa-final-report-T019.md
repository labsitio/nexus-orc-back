# QA Final Report — T019 (issue #282, PR #666)

## SPEC_ID / versão testada
- SPEC_ID: 007-isolamento-multitenant-dados
- Branch: `feat/007-t019-contrato-exportacao-auditoria`
- Commits: `cdd8190`, `412cf57`, `c0e1620`, `0343b4e` (HEAD, draft PR #666)
- Base: `main`
- Tipo: primeira validação (não é reteste)

## Resumo executivo
T019 fixa apenas o contrato de borda (Zod) de `GET /v1/auditoria/orcamentos/export`
— query de filtro/paginação e envelope de resposta — sem controller real, mesmo
padrão já aprovado em T024/spec-004 (`indexacao-status.schema.ts` +
`indexacao-status.contract.test.ts`, PR #547). O BC Acompanhamento não tem
nenhum outro artefato ainda: read model, VO, migration, casos de uso e
controller HTTP real (T022-T029) permanecem pendentes em issues próprias, T029
bloqueada por T022-T028. Essa divisão de escopo é aceitável e consistente com
o precedente já usado neste repositório.

Duas rodadas de `CHANGES REQUESTED` do `backend-reviewer` já corrigiram, antes
deste handoff: (1) nomes de query/response desalinhados do openapi (`itens`
vs. `eventos`, `periodo_inicio`/`periodo_fim` snake_case, `tenantId` no item
de resposta); (2) um 404 cross-tenant indevido — `docs/openapi.yaml` só
declara 400/401 para este path (lista filtrada por RLS, não recurso por ID
único), cross-tenant correto é 200 com `itens` vazio.

QA confirmou, linha a linha contra `docs/openapi.yaml:633-682` (parâmetros de
query, respostas 200/400/401) e `docs/openapi.yaml:1077-1096`
(`TrilhaAuditoriaEvento`/`AuditoriaExportResponse`), que o schema Zod
implementado está correto: 6 query params, `limit` `1-200 default 50`,
`periodo_inicio`/`periodo_fim` `format: date`, item de resposta com os 6
campos obrigatórios/opcionais do openapi, envelope `{ itens, proximoCursor }`
com `proximoCursor` nullable. Nenhum defeito de produção encontrado.

## Nota de risco residual (não bloqueia o gate)
O schema Zod adiciona uma regra que `docs/openapi.yaml` não declara:
`periodo_inicio` e `periodo_fim` só são aceitos juntos (`.refine`). O openapi
declara os dois como parâmetros independentes e opcionais, sem vínculo entre
eles. Não é uma violação de contrato (o openapi não proíbe validação adicional
na borda, e a resposta 400 cai no `BadRequest` já documentado), mas é uma
regra de negócio que não está em `spec.md`/`plan.md`/openapi — nasceu como
decisão de implementação. Registrar para o Arquiteto/PM confirmarem se é
intencional antes de T029, para não haver retrabalho se a decisão for
revertida.

O schema também restringe `resumoPayload` a 3 campos conhecidos
(`fornecedorIdentificado`/`status`/`decisao`), enquanto o openapi declara
apenas `type: object` genérico (sem `properties`). Compatível com o contrato
publicado (superset seria a violação, não subset), mas é uma decisão de
modelagem que pode precisar de revisão quando T022 (read model
`TrilhaAuditoriaEvento`) e os eventos reais de outros BCs (decisões de agente,
por exemplo) forem mapeados em T027 — sinalizar para não travar tipos de
evento futuros que não caibam nesses 3 campos.

Nenhum dos dois pontos é defeito — são decisões de implementação razoáveis,
sem contradição com o contrato publicado, documentadas aqui como risco
residual a confirmar antes da implementação do controller real (T029).

## Requisitos cobertos
Ver `specs/007-isolamento-multitenant-dados/qa/traceability-matrix-T019.md`.
Critério de aceite 2 de `spec.md` (relatório de auditoria via API restrito ao
tenant): contrato de borda coberto nesta task; execução HTTP real fim-a-fim
(401/cross-tenant de fato) depende de T029, ainda não implementada.

## Suítes executadas e comandos
```
pnpm run typecheck
pnpm run lint
pnpm exec vitest run tests/bounded-contexts/acompanhamento/contract/exportacao-auditoria.test.ts
pnpm run test
```

## Resultado
- typecheck (`tsc --noEmit`): 0 erros.
- lint (`eslint .`): 0 erros/avisos.
- Suíte de contrato de T019: **9/9 testes passando**.
- Suíte completa do repositório: **435 arquivos passaram, 42 arquivos com
  testes skipados (integração dependente de Postgres real, limitação de
  ambiente pré-existente e não relacionada a esta task) — 2321 testes
  passaram, 219 skipados, 0 falha**.

## Cobertura
Arquivo novo é só definição de schema Zod (sem lógica além das validações já
exercitadas pelos 9 testes de contrato) — 100% das branches de validação
(`.refine`, `.min`/`.max`, `.date`, `.datetime`, `.uuid`, `.optional`,
`.nullable`) são exercitadas pelos 9 casos. Nenhum código de produção não
testado neste diff. Sem threshold de cobertura pré-existente configurado no
projeto para este BC (ainda não tem nenhum outro arquivo de produção).

## Allure
`allure-vitest` já configurado em `vitest.config.ts` (`resultsDir:
"allure-results"`). `allure-results/` gerado localmente pela execução da
suíte completa acima. Geração do relatório HTML via `npx allure generate` não
executada (mesma limitação de ambiente já registrada nas validações
anteriores desta spec — CLI `allure` não é dependência do projeto); não
bloqueia o gate.

## Bugs encontrados
Nenhum defeito de produção.

## Bugs enviados ao dev-back-end
Nenhum.

## Arquivos verificados pelo QA (nenhuma alteração de produção pelo QA)
- `src/bounded-contexts/acompanhamento/interface/http/exportacao-auditoria.schema.ts` (produção, dev-back-end)
- `tests/bounded-contexts/acompanhamento/contract/exportacao-auditoria.test.ts` (teste, dev-back-end)

## Riscos residuais
- Ver seção "Nota de risco residual" acima (2 decisões de implementação sem
  ancoragem explícita em spec/openapi — não bloqueiam, sinalizar para
  Arquiteto/PM antes de T029).
- Comportamento fim-a-fim (401 real, cross-tenant real via query cross-tenant
  contra RLS) só será verificável quando T029 existir — QA precisará repetir
  a validação de segurança neste endpoint nessa ocasião, não é dispensável
  por este contrato ter passado.

## Limitações do ambiente
Sem AWS real (Cognito/Aurora) disponível nesta validação — consistente com o
que o dev-back-end reportou; não bloqueia o gate porque o escopo de T019 é
estritamente contrato de borda, sem dependência de infraestrutura real.

## Parecer final
APROVADO PELO QA
