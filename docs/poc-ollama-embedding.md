# PoC: gateway de IA local (Ollama) — embedding (spec 004)

Issue #620. Complementa `docs/plano-infra-ambientes.md` §5 (análise) e
`docs/architecture-diagrams/adr-009-composicao-producao-gateway-ia.html`
(decisão de seleção por `NEXO_AGENTE_IA` na composition root). Mesma
receita de #617 (classificador) e #619 (extrator), aplicada à porta
`AgenteEmbeddingGateway`.

## Restrição exclusiva desta porta

Ao contrário das outras portas de IA (texto-para-texto, sem formato de saída
numérico fixo), o schema pgvector já criado
(`src/bounded-contexts/busca-indexacao/infrastructure/persistence/schema/indice-orcamento.schema.ts:54`,
`vector('embedding', { dimensions: 1024 })`) e o VO `Embedding` fixam
vetores de **exatamente 1024 dimensões**. Isso restringe qual modelo Ollama
pode ser usado:

- `mxbai-embed-large` emite 1024 dimensões — usado por este PoC.
- `nomic-embed-text` emite 768 dimensões — **não serve**, sem migrar o
  schema (fora de escopo desta issue).

`OllamaEmbeddingACL.converter` valida a dimensão do vetor bruto antes de
construir o VO `Embedding` e lança `OllamaEmbeddingACLInvalidaError` se
vier diferente de 1024 — nunca trunca, nunca faz padding, nunca normaliza a
dimensão em silêncio: um vetor de dimensão errada corrompe a busca semântica
sem erro visível.

## O que existe

- Serviço `ollama` em `docker-compose.yml` (já criado por #617) — reaproveitado,
  sem container duplicado.
- `OllamaEmbeddingGateway` (`src/bounded-contexts/busca-indexacao/
  infrastructure/ollama-embedding.gateway.ts`) — implementa
  `AgenteEmbeddingGateway`, mesma porta de domínio que
  `BedrockEmbeddingGateway` já implementa. Chama `POST /api/embed` do
  Ollama; nunca constrói o VO `Embedding` diretamente — delega a tradução e
  a validação de dimensão a `OllamaEmbeddingACL`
  (`ollama-embedding.acl.ts`), mesma disciplina de `BedrockEmbeddingACL`.
- `selecionarAgenteEmbedding` (`src/composition/busca-indexacao.ts`) —
  seleção por `NEXO_AGENTE_IA` lida uma única vez na composition root,
  mesmo contrato de `selecionarAgenteExtrator` (#619). `'local'` monta
  `OllamaEmbeddingGateway`, `'bedrock'` monta `BedrockEmbeddingGateway`.
  Nenhum `if` no domínio, nenhum bounded context novo — a duplicação
  aceita é de implementação de porta, nunca de estrutura.

## Como rodar

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull mxbai-embed-large
```

`OLLAMA_BASE_URL`/`OLLAMA_MODELO_EMBEDDING` (`.env.example`) configuram o
gateway; `selecionarAgenteEmbedding({ ollama: {...} }, 'local')` falha
rápido se `config.ollama` não for fornecido — nunca cai para um default
ambíguo dentro da seleção (só `criarAgenteClassificador`/#617 tem defaults
de conveniência embutidos; esta composition root segue o contrato mais
explícito de #619).

## O que este PoC NÃO prova

Registrado explicitamente para não ser reinterpretado como "ambiente local
resolve" em revisões futuras (mesmo texto de `docs/plano-infra-ambientes.md`
§5 e `docs/plano-finalizacao.md`):

- **Dimensão bater não significa espaço vetorial comparável.** `1024 ==
  1024` prova só que o schema pgvector aceita o vetor — não que
  `mxbai-embed-large` e `amazon.titan-embed-text-v2:0` (Bedrock) produzem
  embeddings no mesmo espaço semântico. Dois modelos diferentes nunca
  colocam o mesmo texto no mesmo ponto do espaço vetorial, mesmo com igual
  dimensionalidade — comparar/misturar distância entre vetores dos dois
  modelos não tem significado.
- **Índices não são intercambiáveis entre ambientes.** Um índice
  pgvector populado com embeddings do Ollama local não serve para busca
  contra embeddings gerados pelo Titan V2 em produção, e vice-versa.
  **Reindexação completa é obrigatória** sempre que o modelo de embedding
  mudar (troca `NEXO_AGENTE_IA`, upgrade de versão do modelo, etc.) — nunca
  assumir que os vetores antigos continuam válidos.
- **Qualidade semântica/relevância de busca** não é comparada ao Bedrock
  real — um modelo pequeno de CPU não tem a mesma qualidade de embedding do
  modelo de produção; resultados de busca podem divergir mesmo com a
  dimensionalidade correta.
- **Comportamento de prompt injection do `AgenteInterpretadorConsultaGateway`
  irmão** — #203-equivalente de 004 continua bloqueada por credencial AWS;
  essa porta ainda não tem implementação Bedrock no código, não faz parte
  deste PoC.
- **p95/custo de inferência real** — latência e custo medidos localmente
  não têm relação com produção.

## Escopo desta issue

Só o embedding (spec 004, `AgenteEmbeddingGateway`). O orquestrador (005)
recebe `Ollama<Nome>Gateway` próprio em issue futura (#621) — mesma
disciplina, sem helper compartilhado (`docs/plano-infra-ambientes.md` §5 é
explícito: duplicação de implementação de porta é aceita, duplicação de
estrutura não é).
