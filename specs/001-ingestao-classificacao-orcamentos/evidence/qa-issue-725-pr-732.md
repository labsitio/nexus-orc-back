# QA — issue #725 (ADR-012, formatoIdentificado determinístico) — PR #732

SPEC_ID: 001-ingestao-classificacao-orcamentos (BC `ingestao-identificacao`)
PR: labsitio/nexus-orc-back#732
Branch: refactor/725-formato-identificado-deterministico
Commit testado: c2d214f (base 6f63ec6)
Tipo: primeira validação (sem BUG anterior)
Backend-reviewer: APPROVE WITH NITS (sem BLOCKER/MAJOR)

## Escopo

- `application/use-cases/classificar-orcamento.ts`: nova `derivarFormatoIdentificado(nomeArquivo)`
  pura, exportada — extensão via `lastIndexOf('.')`, valida `/^[a-zA-Z0-9]{1,10}$/`, fallback
  `DESCONHECIDO`, nunca lança. Passa a substituir `resultadoBruto.formatoIdentificado` na
  construção de `ResultadoClassificacao`.
- `domain/gateways/agente-classificador.gateway.ts`: `ResultadoAgenteClassificador` perde o
  campo `formatoIdentificado` — não é mais contrato do gateway.
- `infrastructure/bedrock-classificador.gateway.ts`: tool schema e type guard sem
  `formatoIdentificado`; prompt de sistema não pede mais o formato ao LLM.
- `infrastructure/ollama-classificador.gateway.ts`: troca `format: 'json'` (livre) por JSON
  Schema real (`SCHEMA_RESULTADO_CLASSIFICACAO`) com `description` por propriedade; type guard
  sem `formatoIdentificado`.

## Comandos executados

```
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export DATABASE_URL="postgresql://nexo:nexo@localhost:5433/nexo"
npx tsc --noEmit
npx eslint <8 arquivos de produção+teste alterados>
npx vitest run --reporter=default
```

Postgres confirmado ativo em `localhost:5433` (`pg_isready`) antes da execução.

## Resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | OK, limpo |
| `npx eslint` (8 arquivos do diff) | OK, limpo — inclui a regra de fronteira de BC |
| `npx vitest run` (suíte completa) | 213 arquivos / 1357 testes, 0 falha, 0 skip inesperado |

Baseline pré-PR (main, commit base 6f63ec6): 213 arquivos / 1352 testes, 0 falha. Delta: +5
testes (0 arquivo novo — os 5 casos foram adicionados dentro de arquivos de teste já
existentes), consistente com o diff (`derivarFormatoIdentificado` ganhou 4 casos unitários +
1 caso de integração via `ClassificarOrcamento.executar`). Sem regressão.

## Critérios de aceite (issue #725)

1. **Extensão `.txt` → `formatoIdentificado='TXT'` independente do gateway** — confirmado.
   `classificar-orcamento.test.ts`, caso "deriva formatoIdentificado da extensão do arquivo,
   nunca do agente": `AgenteClassificadorFake` não devolve `formatoIdentificado` (removido do
   contrato), key `.../018f4b1a-...-orcamento.txt`, evento publicado tem
   `resultado.formatoIdentificado === 'TXT'`. Rastreado até a chamada real em
   `classificar-orcamento.ts:163` (`derivarFormatoIdentificado(nomeArquivo)`, `nomeArquivo`
   extraído do último segmento de `referenciaBruta.key`).
2. **Fallback `DESCONHECIDO`** — confirmado, 3 casos: sem extensão, `.` como último
   caractere, extensão não-alfanumérica/longa (`arquivo.exe; rm -rf`, 20 chars) — todos
   `'DESCONHECIDO'`. Nenhum lança.
3. **Formato real `<uuid>-nomeOriginal.ext`** — confirmado: casos usam
   `018f4b1a-0000-7000-8000-000000000000-orcamento.pdf` /`.txt`, e a suíte de integração
   (`classificar-orcamento.integration.test.ts`) simula o valor já derivado em vez de
   depender do gateway. `arquivo.tar.gz` → `'GZ'` prova que o UUID sem ponto não interfere na
   extração do último segmento (dot-split simples, esperado e correto para o formato de key
   real do repo).
4. **`OllamaClassificadorGateway` com schema novo** — confirmado.
   `ollama-classificador.gateway.test.ts`: `corpo.format` não é mais a string `'json'`, é
   objeto JSON Schema (`type:'object'`, `required:['fornecedorIdentificado','nivelConfianca']`,
   sem `formatoIdentificado` em `properties`); teste pré-existente "lança erro se o JSON não
   tiver o shape esperado" preservado intacto, ainda cobre rejeição de shape inválido.
5. **Suíte completa verde, sem regressão** — confirmado, ver tabela acima (213/1357, 0 falha).
6. **Fora de escopo intocado** — confirmado por `git diff` vazio para
   `revisao-humana.{controller,schema}.ts`, `confirmar-revisao-humana.ts`, `extracao/**`,
   `orquestracao/**`. Inspeção manual: `revisao-humana.schema.ts:10` mantém
   `formatoIdentificado: z.string().min(1)` obrigatório; `confirmar-revisao-humana.ts` recebe
   o valor do body humano direto, nunca chama `derivarFormatoIdentificado` — os dois caminhos
   (automático vs. revisão humana) permanecem desacoplados como a issue exige.

## Gap observado (não bloqueante)

`AgenteClassificadorGatewayFake`/`AgenteClassificadorFake` (dobles de teste) já não expõem
`formatoIdentificado` — coerente com o novo contrato do gateway; nenhum doble ficou
divergente do tipo real (`ResultadoAgenteClassificador`), confirmado pelo `tsc --noEmit` limpo.

## Segredos

Nenhuma credencial, token ou dado pessoal em teste, fixture ou log gerado durante a validação.

## Parecer

APROVADO PELO QA.
