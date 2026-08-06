# PoC: gateway de IA local (Ollama) — orquestrador (spec 005)

Issue #621. Complementa `docs/plano-infra-ambientes.md` §5 (análise) e
`docs/architecture-diagrams/adr-009-composicao-producao-gateway-ia.html`
(decisão de seleção por `NEXO_AGENTE_IA` na composition root). Mesma receita
das issues irmãs #617 (classificador, spec 001) e #619 (extrator, spec 002).

## Atenção — porta de maior risco financeiro da cadeia

#258 já registra que `AgenteOrquestradorGateway` é a decisão de maior risco
financeiro do pipeline: decide roteamento de workflow (`APROVAR`,
`ENCAMINHAR_COMPRADOR`, `SOLICITAR_REENVIO`) e integração externa. O ambiente
local com Ollama serve **só** para exercitar o fluxo ponta a ponta — não
substitui nenhuma medição contra o Bedrock real.

## O que existe

- `OllamaOrquestradorGateway` (`src/bounded-contexts/orquestracao/
  infrastructure/ollama-orquestrador.gateway.ts`) — implementa
  `AgenteOrquestradorGateway`, mesma porta de domínio que
  `BedrockOrquestradorGateway` já implementa. Chama `POST /api/chat` do
  Ollama com `format: "json"`; nunca faz parsing de texto livre por regex — o
  único parsing é `JSON.parse` sobre uma resposta que o próprio Ollama
  garante ser JSON, seguido da mesma validação de shape
  (`ehDecisaoWorkflowBruta`) e da mesma ACL (`BedrockDecisaoWorkflowACL`) que
  o gateway Bedrock já usa — inclusive a rejeição de `criterio` vazio (nunca
  aceita decisão sem base auditável).
- `selecionarAgenteOrquestrador` (`src/composition/orquestracao.ts`) —
  seleção por `NEXO_AGENTE_IA` (`'local' | 'bedrock'`), lida uma única vez na
  composition root, mesmo estilo de `selecionarAgenteExtrator` (#619) —
  fail-fast para `NEXO_AGENTE_IA` ausente/inválido. `'local'` monta
  `OllamaOrquestradorGateway` (com defaults se `config.ollama` for omitido,
  mesmo comportamento de `criarAgenteClassificador`/#617), `'bedrock'` monta
  `BedrockOrquestradorGateway`. Nenhum `if` no domínio, nenhuma segunda
  variável de ambiente — a duplicação aceita é de implementação de porta,
  nunca de estrutura.
- Produção continua travada em `bedrock`: `exigirAgenteIaBedrockEmProducao()`
  (`src/composition/aws-clients.production.ts`, ADR-009 Decisão 3) segue
  intocada — `selecionarAgenteOrquestrador` não altera esse comportamento, só
  reflete a mesma variável de ambiente já garantida em produção.

## Como rodar

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.1
```

Nenhum código lê `process.env` para `baseUrl`/`modelo` do Ollama diretamente
— quem compuser a Lambda/execução local decide esses valores e os passa via
`config.ollama` a `selecionarAgenteOrquestrador` (mesma disciplina de
`criarAgenteClassificador`/#617). `selecionarAgenteOrquestrador({}, 'local')`
já usa defaults sensatos (`http://localhost:11434`, `llama3.1` — mesmo
modelo de chat configurado pela issue #617) se omitidos.

## O que este PoC NÃO prova

Registrado explicitamente para não ser reinterpretado como "ambiente local
resolve" em revisões futuras (mesmo texto de `docs/plano-infra-ambientes.md`
§5, `docs/plano-finalizacao.md` e `docs/poc-ollama-classificador.md`):

- **Fidelidade da decisão de workflow** comparada ao Bedrock real em
  produção — um modelo pequeno de CPU não tem a mesma qualidade de
  inferência do modelo de produção ao decidir `APROVAR` vs.
  `ENCAMINHAR_COMPRADOR` vs. `SOLICITAR_REENVIO`.
- **Calibração do limiar de confiança** — o campo `nivelConfianca` que
  `DecisaoWorkflow` usa para decidir `DECIDIDO` vs.
  `PENDENTE_REVISAO_HUMANA`/escalonamento ao comprador não tem o mesmo
  comportamento estatístico entre o modelo local e o Bedrock real; não serve
  para tunar o limiar de produção (#258 — medição de p95 real e decisão de
  Provisioned Concurrency seguem bloqueadas por credencial AWS, esta issue
  não substitui).
- **Comportamento de prompt injection** — a issue #259 (revisão de segurança
  com Bedrock real) continua bloqueada por falta de credencial AWS. Um teste
  adversarial contra o modelo local só exercita que o pipeline de
  isolamento de contexto consolidado em bloco delimitado roda sem erro, não
  substitui essa revisão.
- **p95/custo de inferência real** — latência e custo medidos localmente não
  têm relação com produção, nem com o desfecho ainda aberto da issue #664
  (qual modelo Bedrock — legado vs. Mantle — o caminho `bedrock` usa; #258
  continua bloqueada).

## Escopo desta issue

Só o orquestrador (spec 005, `AgenteOrquestradorGateway`). Portas de IA
irmãs: classificador/001 (#617), extrator/002 (#619), categorizador e
embedding/busca-indexacao (#620) — mesma disciplina, sem helper
compartilhado (`docs/plano-infra-ambientes.md` §5 é explícito: duplicação de
implementação de porta é aceita, duplicação de estrutura não é).
