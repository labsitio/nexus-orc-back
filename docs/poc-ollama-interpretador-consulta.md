# PoC: gateway de IA local (Ollama) — interpretador de consulta (spec 004)

Issue #746. Fecha o gap de paridade ADR-009: `AgenteInterpretadorConsultaGateway`
era a única porta de IA sem contraparte Ollama (classificador #617, extrator
#619, orquestrador #621 e embedding #620 já tinham). Mesma receita das issues
irmãs.

## O que existe

- `OllamaInterpretadorConsultaGateway` (`src/bounded-contexts/busca-indexacao/
  infrastructure/ollama-interpretador-consulta.gateway.ts`) — implementa
  `AgenteInterpretadorConsultaGateway`, mesma porta de domínio que
  `BedrockInterpretadorConsultaGateway` já implementa. Chama `POST /api/chat`
  do Ollama com `format` recebendo JSON Schema real (nunca `format: 'json'`
  livre) — o `enum` de `categoria` restringe a saída ao `catalogoCategorias`
  da chamada, mesmo padrão de `OllamaOrquestradorGateway` (issue #736). A
  tradução do JSON bruto em `CriterioBusca` — incluindo a rejeição de
  categoria fora do catálogo mesmo que o modelo burle o `enum` — é delegada a
  `BedrockInterpretacaoConsultaACL`, reaproveitada sem duplicação (mesmo
  padrão de `ollama-extrator.gateway.ts` reaproveitando `BedrockExtracaoACL`).
- `selecionarAgenteInterpretador` (`src/composition/busca-indexacao.ts`) —
  seleção por `NEXO_AGENTE_IA` (`'local' | 'bedrock'`), lida uma única vez na
  composition root, mesmo estilo de `selecionarAgenteEmbedding`.
- `src/dev/local.ts` não usa mais o stub `interpretadorConsultaLocal`: passa
  o gateway selecionado e o `catalogoCategorias` real, lido de
  `faixas_preco_categoria` via `validacao.gatewayFaixaPreco.listarTodas()` no
  boot do runner local.

## Como rodar

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.1
```

## Validação contra o llama3.1 real

Consulta: *"orçamentos de embalagens acima de 5 mil reais"*, catálogo
`['aço', 'embalagens', 'matéria-prima']`. JSON devolvido pelo gateway
(já traduzido pela ACL para `CriterioBusca`):

```json
{
  "textoLivreResidual": "orçamentos",
  "categoria": "embalagens",
  "precoMinimo": { "valorCentavos": 5000, "moeda": "BRL" }
}
```

`format` real (schema, não a string `'json'`), `categoria` respeitou o
`enum` do catálogo, shape aceito pela ACL sem erro.

Segunda chamada com período relativo (*"...nos últimos 30 dias"*) mostrou o
limite conhecido de modelos pequenos: o `llama3.1` sem saber a data corrente
devolveu uma data inválida em `periodoRecebimento`, e
`BedrockInterpretacaoConsultaACLInvalidaError` rejeitou explicitamente —
prova de que a ACL protege o domínio de saída malformada mesmo quando o
schema sozinho não impede (mesma disciplina das issues irmãs #732/#738).
Interpretação de data relativa a partir do `periodoRecebimento` não é escopo
desta issue.

## O que este PoC NÃO prova

Mesmo texto de `docs/poc-ollama-orquestrador.md`/`docs/poc-ollama-embedding.md`:

- **Fidelidade da interpretação** comparada ao Bedrock real em produção — o
  valor `valorCentavos: 5000` para "5 mil reais" mostra que um modelo pequeno
  de CPU pode errar a conversão numérica; não calibra nada de produção.
- **Comportamento de prompt injection** contra o modelo real — a issue #259
  (revisão de segurança com Bedrock real) continua bloqueada por falta de
  credencial AWS.
- **p95/custo de inferência real** — latência e custo medidos localmente não
  têm relação com produção.

## Escopo desta issue

Só o interpretador de consulta (spec 004, `AgenteInterpretadorConsultaGateway`).
Não altera `BedrockInterpretadorConsultaGateway`, a ACL, o caso de uso
`BuscarOrcamentos` nem o controller.
