# Matriz de rastreabilidade — issue #631 (PR #638, commit ce1989e)

| Requisito / critério | Nível | Cenário | Arquivo | Resultado |
|---|---|---|---|---|
| `tenantId?: string` presente em `ExtracaoEscalonadaParaRevisaoHumana` | Estrutural/contrato | construtor com parâmetro opcional | `src/bounded-contexts/extracao/domain/events/extracao-escalonada-revisao-humana.event.ts` (linha 22) | PASS |
| `tenantId` opcional ausente por padrão | Unit | `criar()` sem tenantId, `evento.tenantId` undefined | `tests/bounded-contexts/extracao/domain/events/domain-events.test.ts` (linhas 76-79) | PASS |
| `tenantId` presente é preservado quando informado | Unit | `criarComTenant(tenantId)`, valor igual ao informado | `tests/bounded-contexts/extracao/domain/events/domain-events.test.ts` (linhas 81-86) | PASS |
| `schemaVersion` mantido em `1` (expand, não contract) | Estrutural/contrato | `schemaVersion` fixo em ambos cenários (com/sem tenantId) | `extracao-escalonada-revisao-humana.event.ts` (linha 21); teste linhas 68 e 85 | PASS |
| Forma idêntica aos dois eventos irmãos (`OrcamentoExtraido`, `OrcamentoExtraidoComPendenciaConfirmada`) | Estrutural/padrão | `tenantId?: string` na mesma posição relativa (antes de `ocorreuEm`) nos 3 construtores | `orcamento-extraido.event.ts` (linha 25), `orcamento-extraido-pendencia-confirmada.event.ts` (linha 26), `extracao-escalonada-revisao-humana.event.ts` (linha 22) | PASS |
| Ordem de parâmetros sem risco de deslocamento posicional | Integração/contrato | busca por todos os call-sites de `new ExtracaoEscalonadaParaRevisaoHumana(...)` no repo | `src/bounded-contexts/extracao/application/use-cases/extrair-dados-orcamento.ts:100` e `tests/.../extrair-dados-orcamento.integration.test.ts:171` — ambos usam apenas 2 args posicionais (`orcamentoId`, `motivo`); nenhum passa `ocorreuEm` posicionalmente | PASS |
| Nenhuma quebra de compatibilidade com chamadas antigas | Integração/contrato | site de emissão (`extrair-dados-orcamento.ts`) e teste de integração continuam compilando/passando sem alteração | `npm run typecheck` limpo; suíte de integração passa | PASS |
| Suíte de domain-events do BC Extração passa | Unit | 9 testes (3 eventos x 3 cenários, sendo 2 comuns + 2 de tenantId por evento com tenant) | `tests/bounded-contexts/extracao/domain/events/domain-events.test.ts` | PASS (9/9) |
| Regressão total do monorepo (sem quebra em outros BCs) | Regressão geral | suíte completa | todos os `tests/**` (node 24, ambiente com Node >=24 conforme `engines`) | PASS (917 passed, 1 expected fail, 99 skipped) |
| `tsc --noEmit` limpo | Estático | typecheck completo do projeto | raiz do repo | PASS (sem erros) |
| `eslint .` limpo | Estático | lint completo do projeto | raiz do repo | Não executável neste ambiente local com Node 16 (ver Observações); executado com Node 24: PASS (sem erros/warnings) |

## Observações e lacunas

1. **Ambiente local com Node 16 quebra eslint** (`structuredClone is not defined`), reproduzido também na branch `main` — não é regressão desta PR. `package.json` declara `"engines": { "node": ">=24" }`. Validação repetida com Node 24 (via nvm): `tsc --noEmit` e `eslint .` limpos, suíte completa (917 testes) verde. CI deve rodar em Node compatível.

2. **Terceiro e último evento de 002 com `tenantId`**: `OrcamentoExtraido` e `OrcamentoExtraidoComPendenciaConfirmada` já tinham o campo (PR #630). Com esta PR, todos os 3 eventos do BC Extração seguem o mesmo contrato de expand (ADR-008).

3. **Emissor (`extrair-dados-orcamento.ts`) ainda não preenche `tenantId`** ao publicar `ExtracaoEscalonadaParaRevisaoHumana` — fora de escopo desta issue (rastreado em outra task/issue de propagação de tenant nos use-cases, ver `wt-280-use-cases-tenant`). Sem regressão: campo opcional, consumidores não afetados.

4. **RLS/isolamento em nível de dado não coberto aqui**: T631 é pura estrutura de evento (expand). Isolamento de dados por `tenant_id` é responsabilidade de outras tasks de 007 já em andamento.

5. **Escopo confirmado dentro do esperado**: diff toca apenas o evento e seu teste unitário; nenhuma alteração em site de emissão, ACLs consumidoras ou outros eventos.
