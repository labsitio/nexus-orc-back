# PoC: gateway de IA local (Ollama) — classificador (spec 001)

Issue #617. Complementa `docs/plano-infra-ambientes.md` §5 (análise) e
`docs/architecture-diagrams/adr-009-composicao-producao-gateway-ia.html`
(decisão de seleção por `NEXO_AGENTE_IA` na composition root).

## O que existe

- Serviço `ollama` em `docker-compose.yml`, ao lado de `postgres` e
  `localstack` — imagem `ollama/ollama`, porta `11434`, volume nomeado
  `ollama-data` para cache de modelo entre restarts.
- `OllamaClassificadorGateway` (`src/bounded-contexts/ingestao-identificacao/
  infrastructure/ollama-classificador.gateway.ts`) — implementa
  `AgenteClassificadorGateway`, mesma porta de domínio que
  `BedrockClassificadorGateway` já implementa. Chama `POST /api/chat` do
  Ollama com `format: "json"`; nunca faz parsing de texto livre por regex —
  o único parsing é `JSON.parse` sobre uma resposta que o próprio Ollama
  garante ser JSON, seguido da mesma validação de shape que o ACL de Bedrock
  já aplica.
- `criarAgenteClassificador` (`src/composition/ingestao-identificacao.ts`) —
  seleção por configuração (`agenteIa: 'local' | 'bedrock'`), lida uma única
  vez na composition root. `'local'` monta `OllamaClassificadorGateway`,
  `'bedrock'` monta `BedrockClassificadorGateway`. Nenhum `if` no domínio,
  nenhum bounded context novo — a duplicação aceita é de implementação de
  porta, nunca de estrutura.

## Como rodar

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.1
```

`OLLAMA_BASE_URL`/`OLLAMA_MODELO_CLASSIFICADOR` (`.env.example`) configuram
o gateway; `criarAgenteClassificador({ agenteIa: 'local' })` já usa defaults
sensatos (`http://localhost:11434`, `llama3.1`) se omitidos.

## O que este PoC NÃO prova

Registrado explicitamente para não ser reinterpretado como "ambiente local
resolve" em revisões futuras (mesmo texto de `docs/plano-infra-ambientes.md`
§5 e `docs/plano-finalizacao.md`):

- **Fidelidade de classificação** comparada ao modelo Bedrock real em
  produção — um modelo pequeno de CPU não tem a mesma qualidade de
  inferência do modelo de produção.
- **Calibração do limiar de confiança** — o campo `nivelConfianca` que o
  domínio usa para decidir escalonamento (`>= X` classifica, `< X` escalona
  para revisão humana) não tem o mesmo comportamento estatístico entre o
  modelo local e o Bedrock; não serve para tunar o limiar de produção.
- **Comportamento de prompt injection** — as issues #64, #109, #158, #203,
  #259 (revisão de segurança com Bedrock real) continuam bloqueadas por
  falta de credencial AWS. Um teste adversarial contra o modelo local só
  exercita que o pipeline de sanitização/isolamento de prompt roda sem erro,
  não substitui essa revisão.
- **p95/custo de inferência real** — latência e custo medidos localmente não
  têm relação com produção (#107, #157, #202, #258 continuam bloqueadas).

## Escopo desta issue

Só o classificador (spec 001, `AgenteClassificadorGateway`). As portas de IA
irmãs (extrator/002, categorizador/003 #151, embedding e interpretador de
consulta/004, orquestrador/005) recebem `Ollama<Nome>Gateway` próprios em
issues futuras (#619, #620, #621) — mesma disciplina, sem helper
compartilhado (`docs/plano-infra-ambientes.md` §5 é explícito: duplicação de
implementação de porta é aceita, duplicação de estrutura não é).
