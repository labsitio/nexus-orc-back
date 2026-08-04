# QA Final Report — T016 (ReceberOrcamento exige tenantId, nunca do body)

## SPEC_ID e versão testada
- SPEC_ID: `007-isolamento-multitenant-dados`
- PR: #633 (draft), branch `feat/279-tenantid-receber-orcamento`, commit `f27939d`
- Issue: #279. Primeira validação (não é reteste).

## Resumo executivo
T016 torna `tenantId: TenantId` obrigatório em `ReceberOrcamento.executar()`,
propagado a `Orcamento.receber(...)`. Os 2 call sites reais foram atualizados na
mesma PR (necessário para compilar): `confirmar-upload.controller.ts` passa a ler
`request.tenantContext.tenantId` (nunca do body) com 401 Problem Details se o
contexto de tenant estiver ausente; `sftp-upload.handler.ts` propaga o `tenantId`
já resolvido por `SftpTenantResolverGateway` (T006) e, quando o mapeamento
usuário/servidor está ausente, registra `console.warn` e pula o registro
(`continue`) em vez de lançar ou travar o lote. Suíte completa, lint e escopo
typecheck do diff limpos; nenhuma regressão; nenhum defeito de produção.

## Requisitos cobertos
- `ReceberOrcamento.executar` exige `tenantId` (tipo não mais opcional) e o
  propaga ao agregado — confirmado por leitura do código e teste unitário
  existente.
- Guardrail de segurança (`tenantId` NUNCA do body): confirmado em dois níveis
  independentes — (1) `confirmarUploadRequestSchema` (Zod) não declara o campo
  `tenantId`; no modo padrão do Zod (`z.object()` sem `.passthrough()`), chaves
  desconhecidas do body bruto são descartadas no `safeParse`, então mesmo um
  cliente malicioso enviando `tenantId` no payload nunca chega a `body.data`;
  (2) o controller lê exclusivamente `request.tenantContext.tenantId` (linha 101
  de `confirmar-upload.controller.ts`), nunca `body.data.tenantId` — que sequer
  existiria no tipo inferido do schema.
- `request.tenantContext` ausente -> 401 Problem Details, `ReceberOrcamento`
  nunca chamado — testado (`confirmar-upload.controller.test.ts`).
- Canal SFTP com mapeamento usuário/servidor ausente: não lança erro, não trava
  o lote — apenas pula o registro afetado (`console.warn` + `continue`) —
  testado (`sftp-upload.handler.test.ts`).
- Demais canais (PORTAL_WEB/API_REST/APP_MOBILE via `confirmar-upload`)
  propagam o tenant vindo do JWT verificado (`TenantContextMiddleware`, T005),
  nunca de outra fonte — confirmado por leitura do controller e teste de
  contrato existente.
- Nenhum outro caller de produção precisou mudar: `upload-url.controller.ts`
  não chama `ReceberOrcamento` (só gera URL presigned); `composition/ingestao-
  identificacao.ts` só instancia a classe, não chama `.executar()` — confirmado
  por `grep -rn "receberOrcamento.executar\|ReceberOrcamento(" src` (fora de
  teste), únicos 2 resultados são os 2 call sites já citados.

## Lacunas (não bloqueantes)
- Nenhum teste automatizado envia `tenantId` explicitamente no body de
  `confirmar-upload` para provar, via requisição HTTP real, que o valor é
  descartado e ignorado. A garantia hoje decorre de dois fatos estruturais
  independentes verificados por inspeção nesta validação (schema Zod sem o
  campo + controller que só lê `tenantContext`), não de uma asserção
  persistida no repositório. Risco residual baixo — quebrar essa garantia
  exigiria duas mudanças de código simultâneas e não relacionadas (adicionar
  `.passthrough()` ao schema E trocar a fonte lida pelo controller).
  Recomendação: um teste adversarial dedicado (body com `{ ..., tenantId:
  'outro-tenant-forjado' }` + `preHandler` de tenant válido diferente, e
  asserção de que `ReceberOrcamento.executar` foi chamado com o `tenantId` do
  JWT, não o do body) elevaria essa garantia de "verificada por inspeção" para
  "provada por teste". Não bloqueia esta PR — mesmo padrão de verificação por
  inspeção já usado e aceito em T004/T014/T015 desta spec.
- `idempotencyKeyDoHeader` (`confirmar-upload.controller.ts`) tem 1 branch não
  coberta (`Array.isArray(valor)`), já documentada em comentário no próprio
  código como defesa sem caminho real via HTTP — pré-existente, não introduzida
  por este diff.

## Ponto crítico verificado: teste RED por desenho não virou verde
`tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts`
(`it.fails`, T011/#274) continua RED após esta mudança, como esperado — depende
de #280/#281 (validação de tenant no repositório/controller de consulta), fora
do escopo desta PR. `git diff HEAD~1 HEAD` confirma que o arquivo não foi
tocado por este commit. Execução completa confirma: nenhum "expected to fail
but passed" foi relatado pelo Vitest.

## Suítes executadas e comandos
```
source ~/.nvm/nvm.sh && nvm use 24
cd /home/victor1090/Documentos/Labs/wt-279-receber-tenant
npm test                    # vitest run
npx tsc --noEmit
npx eslint \
  src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.ts \
  src/bounded-contexts/ingestao-identificacao/interface/http/confirmar-upload.controller.ts \
  src/bounded-contexts/ingestao-identificacao/interface/events/sftp-upload.handler.ts
npx vitest run --coverage --coverage.reporter=json-summary
```

## Resultado
- Suíte completa: **157 arquivos passaram, 19 skip (176 total)** — **914 testes
  passaram, 1 expected fail, 99 skip (1014 total)**. Baseline informado antes da
  mudança era 913 passed; delta de exatamente +1 teste (o novo 401 de
  `confirmar-upload.controller.test.ts`), como esperado. Nenhuma regressão.
- `npx tsc --noEmit`: os únicos erros são pré-existentes em `src/dev/`
  (`@aws-sdk/client-sqs` ausente, `any` implícito), introduzidos pelo commit
  `69712ce` (não relacionado a este diff) — confirmado que `src/dev/` não foi
  tocado por `f27939d`. Nenhum erro nos 3 arquivos de produção do diff.
- `npx eslint` nos 3 arquivos do diff: sem erros.

## Cobertura
Escopo restrito aos 3 arquivos de produção tocados por T016 (`npx vitest run
--coverage --coverage.reporter=json-summary`, suíte completa):
- `receber-orcamento.ts` — 100% statements/branches/functions/lines (14/14 linhas, 6/6 branches).
- `sftp-upload.handler.ts` — 100% statements/branches/functions/lines (16/16 linhas, 6/6 branches).
- `confirmar-upload.controller.ts` — 100% statements/functions/lines (29/29 linhas), 90,9% branches (10/11) — única branch não coberta é a de `idempotencyKeyDoHeader` descrita na seção Lacunas.

Cobertura global do monorepo nesta execução: 84,84% statements, 81,01% branches,
81,18% functions, 84,94% lines — sem redução de nenhum threshold existente
(o projeto não configura thresholds mínimos em `vitest.config.ts`).

## Allure
Não gerado neste ambiente — mesma incompatibilidade `allure-vitest`/`vitest@4.x`
já registrada em ciclos anteriores desta spec (bug de ambiente pré-existente,
não introduzido por este diff). Execução e resultado obtidos via reporter
default do Vitest.

## Bugs encontrados
Nenhum defeito de produção.

## Bugs enviados ao dev-back-end
Nenhum.

## Arquivos criados/alterados por este QA
- `specs/007-isolamento-multitenant-dados/qa/traceability-matrix.md` (seção T016 adicionada)
- `specs/007-isolamento-multitenant-dados/evidence/qa-final-report-T016.md` (este arquivo)

Nenhum arquivo de produção foi alterado por este QA. Os 3 arquivos de produção e
os testes já vieram prontos no commit `f27939d` antes desta validação.

## Riscos residuais
- Guardrail "tenantId nunca do body" verificado por inspeção estrutural, não por
  teste adversarial dedicado (ver seção Lacunas). Recomenda-se adicionar o
  teste antes de sair de draft, se o tempo permitir — não bloqueante.
- Domínio (`Orcamento`) mantém `tenantId` opcional (expand/contract, T014) —
  T016 formaliza a obrigatoriedade só na camada de aplicação para os 2 canais
  já implementados; canais de #280/#281 (Busca & Indexação e demais BCs) ainda
  não exigem `tenantId`, por desenho, até essas issues fecharem.

## Limitações do ambiente
- Suítes de integração Postgres seguem skip por ausência de `DATABASE_URL`
  local (comportamento esperado, mesmo padrão de ciclos anteriores).
- Node do sistema é v16; comandos rodados com `nvm use 24`.
- Allure não gerado (ver seção acima).

## Parecer final
**APROVADO COM RESSALVAS**

Ressalva única, não bloqueante: ausência de teste automatizado adversarial que
envie `tenantId` explicitamente no body e prove sua rejeição via requisição
HTTP real (hoje a garantia é confirmada por inspeção estrutural do schema e do
controller, não por asserção persistida). Recomendado antes de sair de draft;
não impede aprovação da task em si, dado que o guardrail está estruturalmente
correto e verificado nesta validação.
