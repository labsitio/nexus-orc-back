# Test Plan — SPEC 002-extracao-dados-orcamento (leva T001, T005-T011)

## Escopo
Domain layer isolado do BC Extração: Value Objects, agregado `ExtracaoOrcamento`,
3 Domain Events, interfaces de repositório/gateway. Nenhuma dependência de
framework, ORM ou AWS SDK nesta leva.

## Fora de escopo
Infrastructure (Drizzle, S3, EventBridge), Application (casos de uso), Interface
(handlers Lambda, endpoints REST), pipeline end-to-end, p95 de 5 minutos —
todos previstos para PRs seguintes da mesma trilha (T012+).

## Riscos priorizados
1. Campo obrigatório extraído com valor inventado quando confiança insuficiente
   (Princípio IV — crítico, risco financeiro direto).
2. Campo obrigatório incompleto transitando silenciosamente para `EXTRAIDO`.
3. Sobrescrita de `referenciaClassificacao`/`referenciaBrutaS3` após criação.
4. Confirmação humana válida a partir de estado diferente de
   `PENDENTE_REVISAO_HUMANA`, ou histórico sendo apagado em vez de anexado.

## Níveis e tipos de teste
Unitário apenas (Domain puro, sem I/O). Integração/contrato/E2E fora de escopo
até Infrastructure/Application existirem.

## Ambientes e dependências
Node 24, Vitest 4.1.10, sem serviços externos (LocalStack, Postgres, Bedrock
não usados nesta leva).

## Estratégia de dados
Fixtures inline nos próprios arquivos de teste (VOs construídos via factory
functions de teste), sem necessidade de builders compartilhados nesta leva.

## Estratégia de mocks/fakes
Nenhuma — Domain puro não tem dependência externa a mockar.

## Critérios de entrada
Código de produção compilando (`tsc --noEmit`) e lint limpo.

## Critérios de saída
- Todos os testes unitários do BC Extração passando.
- Sem regressão nas suítes já existentes (BC Ingestão & Identificação).
- Os 4 critérios de aceite do spec.md relevantes a esta leva cobertos por
  asserção explícita.
- Typecheck e lint limpos nos arquivos alterados.

## Abordagem Allure
Reporter `allure-vitest` já configurado em `vitest.config.ts` (herdado da spec
001) — `allure-results/` gerado a cada execução via `pnpm run test`. Nenhuma
configuração adicional necessária para esta leva.

## Ordem de execução
1. Value Objects (fundação).
2. `CampoExtraido<T>` (invariante crítica).
3. Agregado `ExtracaoOrcamento` (orquestra os VOs).
4. Domain Events.

## Limitações
- Execução local neste worktree apresentou falha ambiental do reporter
  allure-vitest ("Vitest failed to find the runner") reproduzida de forma
  consistente mesmo com `--pool=forks` e cache limpo — isolada a esta máquina,
  já que a mesma execução (`pnpm run test`, Node 24) passou integralmente no
  CI do PR #409 (run 30571782437: 27 arquivos de teste, 130 testes, 100%
  aprovados, incluindo os 56 testes deste BC). Evidência usada como fonte de
  verdade para o parecer, ver `coverage-baseline.md` e `test-execution-report.md`.
- Sem step de cobertura configurado no workflow de CI hoje (`pnpm run test`
  não passa `--coverage`) — gap pré-existente do projeto, não introduzido por
  este PR.
