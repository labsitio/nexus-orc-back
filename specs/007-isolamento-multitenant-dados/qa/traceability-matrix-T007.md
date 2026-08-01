# Matriz de rastreabilidade — T007 (PR #511)

| Requisito / critério | Nível | Cenário | Arquivo | Resultado |
|---|---|---|---|---|
| Migration adiciona `tenant_id NOT NULL` sem quebrar tabela com linha pré-existente (expand/contract) | Integração/estrutural | `ADD COLUMN ... DEFAULT` + `DROP DEFAULT`, sem default residual, `NOT NULL` confirmado | verificação manual via psql (`pg_attribute`) + sanity-check isolado (tabela-scratch com linha pré-existente) | PASS |
| Índice btree em `tenant_id` nas duas tabelas | Estrutural | `pg_indexes` | verificação manual via psql | PASS |
| RLS habilitada + forçada (`ENABLE`/`FORCE ROW LEVEL SECURITY`) | Integração | catálogo `pg_class` (`relrowsecurity`/`relforcerowsecurity`) | `tests/.../schema/orcamento.schema.test.ts` (teste já existente no PR) | PASS |
| Política `tenant_isolation` presente nas duas tabelas | Integração | catálogo `pg_policies` | `tests/.../schema/orcamento.schema.test.ts` | PASS |
| RLS **impede de fato** leitura cross-tenant (não só configuração de catálogo) | Adversarial/segurança | role real `NOSUPERUSER NOBYPASSRLS`, tenant A não vê linha de tenant B | `tests/security/isolamento-multitenant/rls-enforcement.test.ts` (novo, QA) | PASS |
| RLS é fail-closed: sessão sem `set_config` nenhum nunca retorna tudo silenciosamente | Adversarial/segurança | erro explícito `unrecognized configuration parameter` | `tests/security/isolamento-multitenant/rls-enforcement.test.ts` (novo, QA) | PASS |
| FORCE RLS também vale para role sem privilégio elevado, tenant aleatório sem linhas próprias | Adversarial/segurança | 0 linhas retornadas | `tests/security/isolamento-multitenant/rls-enforcement.test.ts` (novo, QA) | PASS |
| `DrizzleOrcamentoRepository.salvar`/`buscarPorId` continuam funcionando com `set_config` parametrizado (sem regressão single-tenant) | Integração | fluxo completo salvar→buscarPorId, concorrência, idempotência de histórico | `tests/.../drizzle-orcamento.repository.test.ts` (já existente) | PASS (5/5) |
| Regressão geral do BC Ingestão & Identificação | Unit + integração + contrato | suíte completa do BC | `tests/bounded-contexts/ingestao-identificacao/**` | PASS (37 arquivos / 187 testes) |
| Regressão geral do monorepo | Unit + integração + contrato | suíte completa | todos os `tests/**` | PASS (116 arquivos / 608 testes) |
| Tipos e lint dos arquivos alterados | Estático | `tsc --noEmit`, `eslint .` | todo o repo | PASS |

## Lacunas conhecidas (não bloqueiam T007, rastreadas para tasks futuras)
- T009 (checklist BYPASSRLS na infra real AWS/Terraform) ainda não executado — esta
  PR não cobre infraestrutura de nuvem, apenas a migration/schema/repositório.
- T010 (suíte adversarial completa, incluindo query param forjado na Interface) —
  parcialmente antecipada por este QA (camada RLS), mas a camada Interface/Application
  ainda não existe para tenantId real (T014/T016/T018 pendentes).
