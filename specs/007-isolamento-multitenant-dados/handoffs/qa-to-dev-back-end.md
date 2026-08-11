# Handoff QA → dev-back-end (spec 007)

## Contexto

Achado durante a validação de QA da PR #715 (`feat/dev-ambiente-local-002-a-005`,
tarefa de ambiente de desenvolvimento local, sem código de produção alterado).
**Este handoff NÃO bloqueia a PR #715** — o bug está em código de produção de
outro Bounded Context (`ingestao-identificacao`, spec 001), fora do diff dessa
PR, e só ficou visível porque o ambiente local passou a ter tenant context de
verdade pela primeira vez.

## Bugs abertos

| ID | Severidade | Status | Arquivo |
|----|-----------|--------|---------|
| BUG-001 | ALTA | ABERTO | `specs/007-isolamento-multitenant-dados/bugs/BUG-001.md` |

## Comando exato que reproduz

```bash
pnpm docker:up && pnpm db:migrate && pnpm dev:seed && pnpm dev
curl -s -X POST http://localhost:3000/v1/orcamentos/upload-url \
  -H 'content-type: application/json' \
  -d '{"nomeArquivo":"x.txt","canal":"PORTAL_WEB"}'
# PUT do texto na uploadUrl devolvida, depois:
curl -s -X POST http://localhost:3000/v1/orcamentos/{orcamentoId}/confirmar-upload \
  -H 'content-type: application/json' \
  -d '{"canal":"PORTAL_WEB","nomeArquivo":"x.txt"}'
# aguardar poller consumir, observar log "Orçamento sem tenantId no agregado
# (registro pré-retrofit) — ignorado como sucesso idempotente"
curl -s http://localhost:3000/v1/orcamentos/{orcamentoId}/status   # 404
```

## Testes relacionados
Nenhum teste automatizado cobre hoje que `DrizzleOrcamentoRepository.buscarPorId`
reconstitui `tenantId`. Recomenda-se que a correção venha acompanhada de um
teste de integração equivalente ao já existente para `extracao`/`validacao`/
`busca-indexacao`/`orquestracao`.

## Impacto
Bloqueia toda progressão real do pipeline 001→005 (classificação nunca publica
`OrcamentoClassificado`). Afeta produção, não é exclusivo do ambiente local.

## Ordem recomendada de correção
Único bug — corrigir `agregadoDaLinha` (`drizzle-orcamento.repository.ts`) para
incluir `tenantId: TenantId.de(linha.tenantId)`, igual ao padrão dos outros 4
BCs.

## Commit/versão testada
`main` (`19356a0`) e branch da PR #715 (`4049a4e`) — comportamento idêntico nos
dois, confirma que a PR #715 não introduziu nem agravou o bug.

## Condições para reteste
Corrigir o repositório, rodar a suíte do BC `ingestao-identificacao`, e repetir
o smoke test acima confirmando `GET /status` (001) 200 e a fila `extrator-queue`
recebendo mensagem.
