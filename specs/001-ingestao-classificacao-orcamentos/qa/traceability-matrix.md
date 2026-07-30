# Matriz de rastreabilidade — T001 (issue #6)

| Requisito/Risco | Nível | Cenário | Evidência | Resultado |
|---|---|---|---|---|
| `tsc --strict` rejeita tipo incompatível | smoke manual | `.ts` temporário com `string` atribuído a `number` | log do comando (`qa/test-execution-report.md`) | PASSOU |
| `tsc --strict` rejeita chamada com argumento obrigatório faltante | smoke manual | `.ts` temporário chamando função sem argumento | idem | PASSOU |
| `noUncheckedIndexedAccess` rejeita acesso a índice sem narrowing | smoke manual | `.ts` temporário lendo `arr[0]: string` sem `| undefined` | idem | PASSOU |
| `pnpm install` funciona em ambiente limpo (Node 24) | smoke manual | worktree isolado no commit 11b1959 | idem | PASSOU |
| `packageManager` pinado é respeitado pelo corepack | smoke manual | `pnpm --version` no worktree == valor pinado (`11.18.0`) | idem | PASSOU |
| Critérios de aceite funcionais do `spec.md` (Ingestão & Identificação) | — | N/A | N/A | NÃO APLICÁVEL (sem código de domínio nesta task) |

Nenhum requisito funcional de `spec.md` mapeado para T001 — task é puramente
de fundação/scaffolding. Cobertura estrutural (statements/branches/functions/
lines) não mensurável: não há função ou branch de produção no diff além do
placeholder `NEXO_VERSION` (constante, sem lógica).
