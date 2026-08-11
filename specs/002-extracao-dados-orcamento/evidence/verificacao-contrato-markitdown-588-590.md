# Verificação de contrato MarkItDown — #588 (leve, spec 001) vs #590 (completa, spec 002)

## SPEC_ID / issue
- SPEC_ID: 002-extracao-dados-orcamento (issue verificadora #720, `spec-002`)
- Issues confrontadas: #588 (T066, spec 001) e #590 (T046, spec 002)
- ADR de referência: ADR-002 da spec 002 (`specs/002-extracao-dados-orcamento/plan.md:207`) —
  "MarkItDown roda em instância própria por Bounded Context, não como serviço de
  conversão compartilhado". Não confundir com "ADR-002" de outros `plan.md` do
  repo (numeração colide entre specs, não são a mesma decisão).

## Veredito

**DIVERGENTES.** As duas issues descrevem o mesmo envelope de request
(`{conteudoBase64, nomeArquivo}` → `{texto}`), mas o código já mergeado da spec
002 não implementa esse envelope — o ACL de 002 nunca envia `nomeArquivo`. A
descrição da issue #590 está desalinhada com o próprio código que ela cita como
"contrato já fixado pelo lado mergeado".

## O que cada ACL espera hoje (lido na íntegra)

### 001 — `MarkItDownConversaoACL`
- Porta (domain): `src/bounded-contexts/ingestao-identificacao/domain/gateways/markitdown-conversao.acl.ts:8-11`
  `converterParaTexto(conteudoBruto: Uint8Array, nomeArquivo: string): Promise<string>`.
- Implementação (infra): `src/bounded-contexts/ingestao-identificacao/infrastructure/markitdown-conversao.acl.ts`
  - Request enviado ao Lambda (linha 6-9, `MarkItDownInvokePayload`): `{ conteudoBase64: string, nomeArquivo: string }`.
  - Response esperado (linha 12-14, `MarkItDownInvokeResponse`): `{ texto: string }`, validado por type guard (linhas 16-22).
  - Erro: lança `Error` explícito em `FunctionError` do Lambda, payload ausente, JSON inválido, ou shape inesperado (linhas 50-71). Nunca falha silencioso.
  - Texto passa por `sanitizarConteudoDocumento` antes de saída do ACL (linha 73).

### 002 — `MarkItDownConversaoExtracaoACL`
- Porta (domain): `src/bounded-contexts/extracao/domain/gateways/markitdown-conversao-extracao.acl.ts:9`
  `converter(bruto: Buffer): Promise<string>` — **sem parâmetro `nomeArquivo`**.
- Implementação (infra): `src/bounded-contexts/extracao/infrastructure/markitdown-conversao-extracao.acl.ts`
  - Request enviado ao Lambda (linha 6-8, `MarkItDownInvokePayload`): `{ conteudoBase64: string }` — **campo `nomeArquivo` não existe no payload**.
  - Response esperado (linha 11-13): `{ texto: string }`, mesmo type guard, mesmo formato de erro (`FunctionError`/payload ausente/JSON inválido/shape inesperado, linhas 48-69).
  - Texto passa por `sanitizarConteudoExtracao` antes de saída do ACL (linha 71).

### Stubs locais (`src/dev/local.ts`, apenas leitura, não alterados)
- `conversorLocal` (linha 121-131): assina `converterParaTexto(conteudoBruto, nomeArquivo)`, usa `nomeArquivo` para checar extensão suportada (`.txt`/`.md`/`.csv`) e rejeita explicitamente o resto.
- `conversorExtracaoLocal` (linha 133-137): assina só `converter(bruto)`, **não recebe nem checa nome/extensão** — converte qualquer buffer como utf-8. Consistente com a porta de domínio de 002 (que também não tem `nomeArquivo`), mas confirma que o caminho de 002 nunca teve esse dado disponível em nenhuma camada.

## Confronto com o texto das issues

- **#588** declara: "request `{conteudoBase64, nomeArquivo}`, response `{texto}`" — **compatível** com o código real de 001.
- **#590** declara: "request `{conteudoBase64, nomeArquivo}`, response `{texto}` — idêntico ao da spec 001" — **incompatível** com o código real de 002. O ACL mergeado de 002 (`markitdown-conversao-extracao.acl.ts:6-8` e a porta `domain/gateways/markitdown-conversao-extracao.acl.ts:9`) nunca captura nem envia `nomeArquivo`; não há como a Lambda de #590 receber esse campo através do caminho de invocação hoje existente.

## Consequência se não corrigido antes da implementação

Se o time que implementar #590 (T046) seguir a issue ao pé da letra, vai construir
o handler Python esperando um campo `nomeArquivo` que o ACL de 002 nunca envia —
gap silencioso só detectável em runtime/integração, não em code review isolado
da Lambda Python (que não tem visibilidade do lado TypeScript que a invoca).

## Fora de escopo desta verificação

- Não implementei nem alterei nenhuma Lambda Python de #588/#590.
- Não alterei nenhuma porta/ACL/domain gateway (nenhuma mudança de contrato).
- Não toquei em `src/dev/local.ts`, `infra/`, `drizzle/`, `src/interface/shared/`.
- Não toquei em `classificar-orcamento.ts` nem `classificador-queue.handler.ts` (issue #719 em paralelo).

## Encaminhamento

Divergência de contrato entre dois Bounded Contexts é decisão de arquitetura, não
do dev-back-end. Encaminhado ao `arquiteto-back` para decidir: (a) corrigir o
texto de #590 para refletir o payload real (`{conteudoBase64}` sem `nomeArquivo`),
ou (b) decidir que 002 também precisa de `nomeArquivo` no payload — o que exigiria
mudar a porta de domínio `MarkItDownConversaoExtracaoACL.converter` e a
implementação já mergeada, fora do escopo desta issue de verificação (#720).
