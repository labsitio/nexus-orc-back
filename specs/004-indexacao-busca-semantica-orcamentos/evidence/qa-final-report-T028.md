# QA Final Report — T028 (`BedrockEmbeddingGateway` + `BedrockEmbeddingACL`)

## SPEC_ID / versão testada
- SPEC_ID: 004-indexacao-busca-semantica-orcamentos
- Task: T028 (Infrastructure: `BedrockEmbeddingGateway` + `BedrockEmbeddingACL`, Amazon Titan Text Embeddings V2, `amazon.titan-embed-text-v2:0`, 1024 dimensões)
- PR: #550 (labsitio/nexus-orc-back, draft), branch `feat/188-bedrock-embedding-gateway`, `Closes #188`
- Commit testado: 0887bad
- Primeira validação de QA (não é reteste de BUG)
- backend-reviewer: APPROVE WITH NITS (2 NITs não bloqueantes, registrados no PR)

## Resumo executivo
Task puramente de infraestrutura, sem consumidor ainda integrado (`IndexarOrcamento`
é T029, não implementado). `BedrockEmbeddingGateway` implementa
`AgenteEmbeddingGateway` via `InvokeModelCommand` (não Converse/tool-use — modelos
de embedding não suportam tool-use, corretamente justificado no código e no PR,
consistente com a diferença já documentada entre specs 001/002, que usam
Converse). `BedrockEmbeddingACL` traduz `{ embedding: number[] }` para o VO
`Embedding`, validando adicionalmente dimensão exata de 1024
(`DIMENSAO_EMBEDDING_TITAN_V2`) antes de repassar ao construtor do VO (que já
valida `vetor.length === dimensao`) — dupla validação intencional (ACL valida
contra a constante do modelo; VO valida consistência interna própria), sem
redundância problemática. Assinatura do gateway (`gerarEmbedding(texto):
Promise<Embedding>`) bate exatamente com a interface de domínio
`AgenteEmbeddingGateway` (`src/bounded-contexts/busca-indexacao/domain/gateways/agente-embedding.gateway.ts`).
Nenhum defeito de produção encontrado.

## Testes executados
Comando (NÃO `pnpm test` — incompatibilidade ambiental conhecida do
allure-vitest): `npx vitest run --reporter=default <arquivo>`.

1. Suíte alvo isolada (2 arquivos): `bedrock-embedding.gateway.test.ts` (4
   testes) + `bedrock-embedding.acl.test.ts` (4 testes) — 8/8 passando.
2. Suíte completa do BC (`tests/bounded-contexts/busca-indexacao`): 16 arquivos
   passando, 3 skip (integração de persistência/pgvector sem `DATABASE_URL`
   local — `describe.skipIf(!DATABASE_URL)`, mesma limitação documentada nos
   relatórios anteriores T016/T017/T022, não relacionado a T028). 94 testes
   passando, 21 skipped, nenhuma falha.
3. `npx tsc --noEmit -p tsconfig.json` — sem erros.
4. `npx eslint` nos 4 arquivos de T028 (2 de produção + 2 de teste) — sem
   findings.
5. `gh pr view 550` — CI (`ci`) `SUCCESS`; Debricked (vulnerabilidade de
   terceiros) `NEUTRAL`, não bloqueante.

## Cobertura (T028)
Via `--coverage --coverage.reporter=json-summary`, lido de
`coverage/coverage-summary.json` por caminho absoluto de arquivo (a tabela
ASCII do terminal trunca/oculta essas duas linhas visualmente, por isso a
leitura direta do JSON foi necessária para confirmar o número real):

- `bedrock-embedding.acl.ts`: 100% statements (10/10), 100% branches (8/8),
  100% functions (4/4), 100% lines (9/9).
- `bedrock-embedding.gateway.ts`: 100% statements (11/11), 100% branches
  (5/5), 100% functions (2/2), 100% lines (11/11).

Sem regressão; task nova, baseline de cobertura destes 2 arquivos não existia
antes (arquivos novos neste PR).

## Cobertura dos requisitos / critérios de aceite avaliados para T028
- Caso feliz (embedding de 1024 dimensões, request shape correto
  `inputText`/`dimensions`/`normalize`): coberto.
- Shape de resposta inválido (`{ mensagem: ... }` sem `embedding`): coberto —
  `ehEmbeddingBruto` rejeita e o gateway lança erro legível.
- Dimensão errada devolvida pelo modelo (256/512 em vez de 1024): coberto —
  `BedrockEmbeddingACL.converter` lança `BedrockEmbeddingACLInvalidaError`,
  propagada pelo gateway.
- Resposta sem `body`: coberto — gateway lança erro dedicado antes de tentar
  `JSON.parse`.
- Consistência com padrão de ACL das specs 001–003 (`BedrockExtracaoACL`,
  `MarkItDownConversaoACL`): nome de classe, padrão de type guard estrutural
  (`ehXxxBruto`) e erro de domínio próprio (`extends ErroDominio`) seguidos
  corretamente. Uma divergência de padrão identificada (ver "Bugs
  encontrados" — não é bug, é o mesmo NIT do backend-reviewer, registrado
  aqui por completude e concordância).

### Lacuna identificada, não bloqueante
- `JSON.parse(decodificadorUtf8.decode(resposta.body))` no gateway (linha 48)
  não está envolvido em `try/catch` — diferente do padrão já estabelecido em
  `markitdown-conversao.acl.ts`/`markitdown-conversao-extracao.acl.ts` (specs
  001/002), que envolvem `JSON.parse` de payload externo em `try/catch` e
  traduzem para uma mensagem de erro legível. Aqui, um corpo malformado (JSON
  inválido) do Bedrock propagaria um `SyntaxError` nativo não traduzido, em
  vez de um erro no padrão `BedrockEmbeddingGateway: ...` usado nos demais
  branches do mesmo método. Não há teste cobrindo esse caso (JSON
  sintaticamente inválido — diferente do caso já testado de "shape inválido",
  que é JSON válido mas sem o campo esperado). Concordo com a classificação
  do `backend-reviewer` como NIT não bloqueante: (a) task é infra isolada,
  sem consumidor real ainda (T029), (b) a causa realística de "corpo
  malformado" do Bedrock é rara comparada a erro de shape, (c) mesmo sem
  tratamento, a exceção não fica silenciosa — propaga e, uma vez que T029
  invocar este gateway dentro de `registrarTentativaIndexacao`, cairá no
  mesmo caminho de exceção técnica tratado por lá (Princípio IV). Registrado
  como risco residual para acompanhamento em T029, não como defeito de
  produção desta task.

## Bugs encontrados
Nenhum defeito de produção. Nenhum BUG-XXX aberto.

## Riscos residuais
- Ver lacuna de `JSON.parse` sem `try/catch` acima — sugiro ao dev-back-end
  considerar endereçá-la (junto com a constante nomeada de `normalize: true`)
  no mesmo PR que implementar T029, já que é o primeiro ponto em que este
  gateway passa a ter um consumidor real e testes de integração ponta a
  ponta.
- Reconfirmação do model ID vigente no console Bedrock (T032, ação humana de
  Ricardo) segue pendente, fora do escopo de teste automatizado.

## Limitações do ambiente
- Suíte de integração de persistência (`drizzle-pgvector-indice-orcamento.repository.test.ts`,
  `indice-orcamento.schema.test.ts`, `indice-orcamento-completo.schema.test.ts`)
  segue skip por ausência de `DATABASE_URL`/Postgres real neste ambiente de
  validação — mesma limitação já documentada nos relatórios anteriores da
  spec (T016, T017, T022), não relacionada a T028.
- `pnpm test` não foi usado (incompatibilidade ambiental conhecida
  allure-vitest) — todos os comandos acima usaram `npx vitest run
  --reporter=default` diretamente.

## Parecer final
APROVADO PELO QA
