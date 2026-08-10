# Matriz de rastreabilidade — T048 (issue #690, ADR-010 T6)

| Requisito / critério de aceite | Risco | Cenário | Caso automatizado | Resultado |
|---|---|---|---|---|
| `POST .../workflow/decisao-humana` ignora `papel`/`papeis` forjado no BODY | Escalação de privilégio via body | Token sem `comprador-responsavel`, body com `papeis: ['comprador-responsavel']` | `403 — ... forjado no BODY é ignorado` | PASSA |
| Idem, HEADER customizado (`x-papel`/`x-role`/`x-papeis`) | Escalação via header não padronizado | Token sem papel, headers forjados | `403 — ... forjado em HEADER customizado é ignorado` | PASSA |
| Idem, QUERY STRING | Escalação via query | Token sem papel, `?papel=...&papeis=...` | `403 — ... forjado na QUERY STRING é ignorado` | PASSA |
| Contraprova: `cognito:groups` real com `comprador-responsavel` autoriza | Falso positivo do guard (fail-closed indevido) | Token com o grupo real, sem forjar nada | `200 — contraprova` | PASSA |
| `POST /v1/configuracoes/faixas-preco-categoria` ignora papel forjado no BODY | Escalação via body | Token sem `compliance-admin`, body com `papel`/`papeis` | `403 — ... forjado no BODY é ignorado` | PASSA |
| Idem, HEADER customizado | Escalação via header | Token sem papel, `x-papel`/`x-role` | `403 — ... forjado em HEADER customizado é ignorado` | PASSA |
| Idem, QUERY STRING | Escalação via query | Token sem papel, `?papel=compliance-admin` | `403 — ... forjado na QUERY STRING é ignorado` | PASSA |
| Contraprova: `cognito:groups` real com `compliance-admin` autoriza (POST) | Falso positivo do guard | Token com o grupo real | `201 — contraprova` | PASSA |
| GET da mesma rota também exige papel (plan.md: POST e GET) | GET desprotegido apesar do POST protegido | Token sem papel, header forjado, `GET` | `GET 403 — ... ignorado na leitura` | PASSA |

## Verificação de mutação (prova de que o teste falha pelo motivo certo)

QA removeu manualmente `criarExigenciaPapel(...)` do array de `preHandler` em
`decisao-humana.controller.ts` (revertido antes do commit, nenhuma alteração
de produção permanece) e re-executou a suíte: os 3 casos `403` de body/header/
query da 1ª `describe` viraram `200`, exatamente como esperado de um guard
removido — confirma que o teste mede a garantia real, não um artefato do
próprio teste.

## Restrição da issue

Nenhum mock do middleware de auth. `criarTenantContextMiddleware` é o real,
importado de `src/interface/shared/tenant-context.middleware.ts`; apenas
`aws-jwt-verify` (`CognitoJwtVerifier.create`) é mockado para controlar o
payload do JWT — mesmo padrão de `tenantid-forjado-http-adversarial.test.ts`
(#635). Confirmado por leitura do arquivo, sem fake de `request.papeis`.
