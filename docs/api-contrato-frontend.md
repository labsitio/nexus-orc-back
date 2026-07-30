# Contrato de API Nexo — Guia de Leitura para o Frontend

Handoff de contrato **antes** do início da implementação backend. Fonte de verdade
técnica é [`docs/openapi.yaml`](openapi.yaml) (OpenAPI 3.1). Este documento é o guia de
leitura — não repete o schema, explica como usá-lo e, principalmente, **o que é firme
vs. o que é suposição** para fechar o contrato.

> Estado do repositório: fase de especificação (Spec-Driven Development). Não há código
> de implementação ainda — este contrato é derivado de `spec.md`/`plan.md` em
> `specs/001` a `specs/005` e `specs/007`, não de uma API já rodando.

---

## 1. Autenticação

- Todo endpoint (exceto onde explicitamente indicado) exige `Authorization: Bearer <JWT>`.
- O JWT é emitido pelo **Amazon Cognito User Pool**. Não existe API key nem header de
  tenant separado.
- **Tenant nunca é um header, query param ou campo de body.** É resolvido
  exclusivamente da claim `custom:tenant_id`, já verificada dentro do próprio JWT (spec
  007, convenção #5). Se o frontend hoje trabalha com um conceito de "workspace/conta
  selecionada", isso deve mapear para qual usuário/token está logado — nunca para um
  parâmetro que o cliente escolhe livremente.
- Papéis (ex. `comprador-responsavel`, `compliance-admin`) também vêm de grupos/claims
  Cognito, não de headers customizados.
- Canal **SFTP não faz parte deste contrato HTTP** — o arquivo chega direto ao S3 via
  AWS Transfer Family, fora do domínio de qualquer chamada de frontend.

---

## 2. Fluxo de ponta a ponta (upload → acompanhamento)

```
1. POST /orcamentos/upload-url           → recebe { orcamentoId, uploadUrl }
2. PUT <uploadUrl>                        → upload direto ao S3 (fora da API Nexo)
3. POST /orcamentos/{orcamentoId}/confirmar-upload   → dispara o pipeline (idempotente via Idempotency-Key)
4. GET  /orcamentos/{orcamentoId}/status  → acompanha classificação
   (opcional, PROVISÓRIO) GET /orcamentos/{orcamentoId} → visão consolidada de todas as etapas
5. Pipeline assíncrono avança sozinho: classificação → extração → validação → indexação → workflow
6. Se qualquer etapa cair em "pendente de revisão humana", o frontend deve oferecer a
   tela correspondente e chamar o endpoint de decisão humana daquele BC
```

Importante: passos 4 em diante são **assíncronos e independentes por Bounded Context**.
Não existe, hoje, um único WebSocket/SSE de status — o frontend deve fazer polling nos
endpoints de status (um por etapa, ou o endpoint consolidado provisório) até o estado
desejado aparecer. Nenhuma spec define intervalo de polling recomendado; a meta de
p95 ≤ 5 minutos por etapa (specs 001-005) é a única referência de tempo disponível.

---

## 3. Estados possíveis por etapa e o que a tela deve fazer

| Etapa (BC) | Estados possíveis | Ação esperada da tela |
|---|---|---|
| **Ingestão** (001) | `RECEBIDO` → `CLASSIFICADO` \| `PENDENTE_REVISAO_HUMANA` | `PENDENTE_REVISAO_HUMANA`: oferecer tela de confirmação de fornecedor/formato (`POST .../revisao-humana`). Nunca oferecer "aprovar automaticamente" nesse estado — só o backend decide isso. |
| **Extração** (002) | `PENDENTE` → `EXTRAIDO` \| `PENDENTE_REVISAO_HUMANA` \| `EXTRAIDO_COM_PENDENCIA_CONFIRMADA` | `PENDENTE_REVISAO_HUMANA`: tela de preenchimento manual de campo(s) faltante(s), cada campo com opção explícita "informar valor" OU "confirmar indisponível no documento". `EXTRAIDO_COM_PENDENCIA_CONFIRMADA` é estado terminal válido — não é erro, exibir como "extraído com pendência aceita". |
| **Validação** (003) | `PENDENTE` → `VALIDADO` \| `PENDENTE_REVISAO_HUMANA` \| `VALIDADO_COM_RESSALVA` | `PENDENTE_REVISAO_HUMANA`: exibir lista de `inconsistencias` (cada uma com `regra` + `detalhe` legível) e oferecer `CORRECAO_APLICADA` ou `ACEITE_COM_RESSALVA`. `VALIDADO_COM_RESSALVA` é terminal válido, sinalizar visualmente como "validado com ressalva", nunca como erro. |
| **Indexação** (004) | `PENDENTE` → `INDEXADO` \| `FALHA_INDEXACAO` | `FALHA_INDEXACAO` **nunca bloqueia nada de negócio** — o orçamento continua "validado" e usável. É só a busca semântica que fica indisponível para aquele item; retry é automático no backend. Não oferecer ação humana aqui. |
| **Workflow** (005) | `AGUARDANDO_CONTEXTO` → `CONTEXTO_CONSOLIDADO` → `DECIDIDO` \| `PENDENTE_REVISAO_HUMANA` | `PENDENTE_REVISAO_HUMANA`: tela para o **comprador responsável** (papel distinto) decidir `APROVAR` \| `ENCAMINHAR_COMPRADOR` \| `SOLICITAR_REENVIO`, com `justificativa` sempre obrigatória. `DECIDIDO` com `acao: APROVAR` é a única forma de "orçamento aprovado" — nunca inferir aprovação de nenhum outro estado. |

Regra geral repetida em todas as specs: nenhum estado "pendente" bloqueia o
processamento de **outros** orçamentos — é seguro a tela mostrar uma lista de vários
orçamentos em paralelo, cada um em etapas diferentes.

---

## 4. Idempotência

- `POST /orcamentos/{orcamentoId}/confirmar-upload` aceita header opcional
  `Idempotency-Key`. Reenviar a mesma chave dentro de 24h retorna o mesmo `orcamentoId`
  já existente, sem duplicar o registro. **Recomendado**: o frontend deve gerar essa
  chave uma única vez por tentativa de upload do usuário (ex. UUID gerado no clique do
  botão "Enviar"), para reenvio automático em caso de falha de rede não duplicar o
  orçamento.
- Nenhum outro endpoint de escrita documenta idempotência explícita nas specs — trate
  os demais POSTs (`revisao-humana`, `decisao-humana`) como não-idempotentes: reenviar
  a mesma decisão humana duas vezes pode gerar 409 (estado já não é mais o esperado),
  o que é o comportamento correto, não um bug.

---

## 5. Erros — Problem Details (RFC 7807)

Todo erro segue o schema `ProblemDetails` (`type`, `title`, `status`, `detail`,
`instance`). Casos a tratar explicitamente na UI:

- **404** em qualquer `GET .../{orcamentoId}/...`: pode significar "não existe" OU
  "existe, mas pertence a outro tenant" — a API nunca diferencia os dois casos de
  propósito (spec 007: nunca revelar existência cross-tenant via 403). Tratar sempre
  como "orçamento não encontrado", nunca como pista de que existe em outro lugar.
- **409** em endpoints de decisão humana: o estado mudou entre a tela carregar e o
  usuário agir (ex. outra pessoa já revisou). Recarregar o status antes de mostrar o
  formulário de decisão novamente.
- **401**: token expirado/inválido — redirecionar para login, nunca tentar novamente
  automaticamente sem novo token.
- **403**: papel insuficiente (ex. usuário sem papel "comprador-responsavel" tentando
  decidir workflow) — mostrar mensagem de permissão, não confundir com 401.

---

## 6. Busca semântica

`POST /orcamentos/busca` é leitura pura, verbo POST porque o corpo pode combinar
`consulta` em linguagem natural + filtros estruturados (`categoria`, `precoMinimo`,
`precoMaximo`, `periodoInicio`, `periodoFim`). Paginação é **por página**
(`pagina`/`tamanhoPagina`), diferente da exportação de auditoria (`cursor`/`limit`) —
essa assimetria é real, vem de duas specs diferentes (004 e 007) que não coordenaram o
padrão de paginação entre si; não é erro deste documento.

**Risco de segurança já conhecido e documentado na spec 004**: esta busca autentica o
usuário mas não filtra resultado por permissão individual sobre cada orçamento — dentro
do mesmo tenant, qualquer usuário autenticado pode encontrar qualquer orçamento
validado. Aceitável apenas em single-tenant (Fase 01/02); revisar antes de expor a
telas onde isso importa antes da Fase 03 estar em produção real.

---

## 7. Status do contrato

### 7.1 Derivado das specs (contrato firme, rastreável a `plan.md`)

| Endpoint | Origem |
|---|---|
| `POST /orcamentos/upload-url` | `specs/001-ingestao-classificacao-orcamentos/plan.md` (Interface, ADR-002) — endpoint existe; **shape do corpo é PROVISÓRIO**, ver 7.2 |
| `POST /orcamentos/{orcamentoId}/confirmar-upload` | idem, incluindo idempotência via `Idempotency-Key` |
| `GET /orcamentos/{orcamentoId}/status` | `specs/001.../plan.md` (Interface) |
| `POST /orcamentos/{orcamentoId}/revisao-humana` | `specs/001.../plan.md` (Interface) |
| `GET /orcamentos/{orcamentoId}/extracao/status` | `specs/002-extracao-dados-orcamento/plan.md` (Interface) |
| `POST /orcamentos/{orcamentoId}/extracao/revisao-humana` | idem — **shape do corpo é PROVISÓRIO**, ver 7.2 |
| `GET /orcamentos/{orcamentoId}/validacao/status` | `specs/003-validacao-consistencia-orcamentos/plan.md` (Interface) |
| `POST /orcamentos/{orcamentoId}/validacao/decisao-humana` | idem |
| `GET|POST /configuracoes/faixas-preco-categoria` | idem (CRUD administrativo, YAGNI declarado na própria spec) |
| `GET /orcamentos/{orcamentoId}/indexacao/status` | `specs/004-indexacao-busca-semantica-orcamentos/plan.md` (Interface) |
| `POST /orcamentos/busca` | idem |
| `GET /orcamentos/{orcamentoId}/workflow/status` | `specs/005-orquestracao-workflow-integracoes/plan.md` (Interface) |
| `POST /orcamentos/{orcamentoId}/workflow/decisao-humana` | idem |
| `GET /auditoria/orcamentos/export` | `specs/007-isolamento-multitenant-dados/plan.md` (Interface, ADR-006) |
| Autenticação Cognito JWT + tenant via claim | `specs/001.../plan.md` (Interface) + `specs/007.../plan.md` (convenção #5, ADR-003/004/005) |

### 7.2 Assumido pelo arquiteto para fechar o contrato (PROVISÓRIO, sujeito a mudança)

- **Corpo de `POST /orcamentos/upload-url`** (`canal`, `nomeArquivo`, `tipoConteudo`,
  `referenciaExterna`): a spec 001 descreve a existência do endpoint e o padrão de duas
  chamadas (ADR-002), mas não o schema exato do corpo. Confirmar com backend antes de
  implementar upload real.
- **Corpo de `POST /orcamentos/{orcamentoId}/extracao/revisao-humana`**
  (`camposConfirmados[].caminho/valor/indisponivel`): a spec 002 descreve o
  comportamento ("cada campo confirmado recebe valor real OU marcação explícita
  'indisponível'"), não o schema de payload. O caminho por string (`itens[0].precoUnitario`)
  é uma convenção assumida, não confirmada pelo backend.
- **Corpo de `dadosCorrigidos` em `POST /orcamentos/{orcamentoId}/validacao/decisao-humana`**:
  a spec 003 exige que `CORRECAO_APLICADA` reenvie "dados corrigidos", sem detalhar o
  shape exato — modelado como objeto livre no OpenAPI, PROVISÓRIO.
- **`GET /orcamentos/{orcamentoId}`** (status consolidado de todas as etapas): endpoint
  inteiro é PROVISÓRIO — ver 7.3. Não depender dele para funcionalidade crítica sem
  confirmação do backend; usar os 5 endpoints de status por BC como alternativa firme.
- **Paginação por página em `/orcamentos/busca` vs. cursor em `/auditoria/orcamentos/export`**:
  ambas são derivadas fielmente de suas specs de origem (004 e 007 respectivamente) —
  não é uma suposição, é uma inconsistência real entre specs que o frontend precisa
  tratar como dois padrões distintos, não unificar por conta própria.

### 7.3 Lacunas conhecidas (não inventadas, sinalizadas)

- **Não existe spec/plan de um Bounded Context "Acompanhamento" completo.** O README e
  `docs/arquitetura-escopo-completo.md` citam a spec 007 como cobrindo "Acompanhamento,
  escopo tático" — mas 007 cobre apenas **exportação de auditoria em lote por tenant**
  (`GET /auditoria/orcamentos/export`), nunca um endpoint de status consolidado por
  orçamento individual. Uma spec numerada "006" (Portal do Gestor) é citada
  historicamente nas notas de revisão de 001/002/005 como tendo existido e sido
  removida/reduzida — não há `specs/006-*/` no repositório atual.
- O endpoint `GET /orcamentos/{orcamentoId}` deste contrato é a tentativa do arquiteto
  de fechar essa lacuna de forma minimamente útil ao frontend, mas **não tem dono
  confirmado no backend** — antes de depender dele, seria necessário: (a) uma spec
  própria de Acompanhamento com `plan.md`, ou (b) confirmação explícita do
  `dev-back-end`/PM de que esse endpoint será implementado com este shape.
- **Autorização por papel dentro do mesmo tenant** (ex. gestor vs. comprador com
  escopos de API diferentes) é declarada como fora de escopo em `specs/007.../spec.md`
  ("Fora de escopo desta spec") — hoje modelada aqui apenas como exigência de papel
  Cognito em endpoints específicos (`comprador-responsavel`, `compliance-admin`), sem
  uma matriz de permissão mais fina documentada em nenhuma spec.
- **Nenhuma spec define intervalo de polling recomendado** para os endpoints de
  status — apenas a meta de latência de pipeline (p95 ≤ 5 min por etapa). Um mecanismo
  de push (WebSocket/SSE) não está especificado em nenhum plan.md; se o frontend
  precisar disso, é uma feature nova a especificar via Spec Kit, não uma suposição
  deste contrato.
- **Formato de exportação de auditoria** é JSON paginado por decisão explícita (ADR-006
  da spec 007) — CSV/PDF não fazem parte deste contrato; conversão é responsabilidade
  do frontend/consumidor externo.

---

## 8. Pontos que o backend precisa confirmar antes do frontend codar contra este contrato

1. Schema exato do corpo de `POST /orcamentos/upload-url` (canais aceitos no corpo vs.
   inferidos do JWT/contexto de requisição).
2. Schema exato de `camposConfirmados` em `POST .../extracao/revisao-humana` — em
   particular, se o "caminho" de campo é uma string livre (como assumido aqui) ou uma
   estrutura tipada por item/condição.
3. Shape de `dadosCorrigidos` em `POST .../validacao/decisao-humana`.
4. Se `GET /orcamentos/{orcamentoId}` (status consolidado) será implementado, por qual
   time/BC, e com qual shape — ou se o frontend deve assumir definitivamente que vai
   orquestrar 5 chamadas separadas.
5. Intervalo de polling recomendado (ou plano de introduzir push/SSE) para os
   endpoints de status.
6. Confirmação de que o único mecanismo de tenant é a claim JWT — nenhum plano de
   introduzir seleção de tenant multi-conta por usuário (um JWT por tenant vs. um JWT
   com múltiplos tenants e troca de contexto).
