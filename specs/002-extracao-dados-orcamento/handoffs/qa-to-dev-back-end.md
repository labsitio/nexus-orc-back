# Handoff QA → dev-back-end — SPEC 002 (leva T001, T005-T011)

## Bugs abertos por severidade
- BAIXA: `specs/002-extracao-dados-orcamento/bugs/BUG-001.md` — getter
  `ExtracaoOrcamento.historico` retorna referência interna mutável (mesma
  classe de nit já corrigida para `itens` no commit 82bb32b).

Nenhum bug CRÍTICO, ALTO ou MÉDIO em aberto.

## Comando que reproduz (leitura de código, não requer execução de teste)
```ts
const extracao = ExtracaoOrcamento.criar(orcamentoId, refClass, refS3);
extracao.registrarTentativaExtrator(itens, condicoes);
extracao.historico.length = 0; // mutação externa não impedida
```

## Ordem recomendada
Não bloqueante — pode ser corrigido junto com T012+ (Infrastructure) ou em
commit isolado antes disso. Fix sugerido: `return [...this._historico];` no
getter, análogo ao já feito para `itens`.

## Condições para reteste
Após o fix, QA valida com 1 teste unitário adicional (mutar o array retornado
por `.historico` e confirmar que o estado interno do agregado permanece
inalterado) e reexecuta a suíte completa do BC Extração.

## Commit/versão testada
`82bb32b152fc2bee2a3133414d4aa0ae0ec9c1db` (PR #409, branch `feat/002-extracao`)
