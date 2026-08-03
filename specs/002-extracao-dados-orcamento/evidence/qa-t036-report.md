# QA — T036 (imutabilidade referenciaBrutaS3/referenciaClassificacao)

SPEC_ID: 002-extracao-dados-orcamento
Commit testado: f62b64b (branch feat/002-t036-unit-test-imutabilidade)
Worktree: /home/victor1090/Documentos/Labs/wt-002-t036

## Parecer
APROVADO PELO QA

## Diff analisado
Único arquivo alterado: specs/002-extracao-dados-orcamento/tasks.md (marca T036 concluída).
Nenhum código de produção ou teste novo no PR.

## Verificação
Comando: `npx vitest run tests/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.test.ts` (Node 24)
Resultado: 10 passed (10), describe "ExtracaoOrcamento — imutabilidade de referências" (linhas 146-156): 2/2 passando.

Cenários cobertos:
- atualizarReferenciaClassificacao() em agregado válido lança ReferenciaImutavelError.
- atualizarReferenciaBrutaS3() em agregado válido lança ReferenciaImutavelError.

Implementação (src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.ts:69-75):
ambos os métodos são `never` e lançam ReferenciaImutavelError incondicionalmente — consistente
com contrato de imutabilidade após criação do agregado.

## Conclusão
Critério de aceite de T036 já integralmente coberto pela suíte existente. Não há regressão,
não há defeito de produção. Reafirma padrão já validado em T017/T027/T035 (mesmo tasks.md).
Nenhum arquivo de teste ou produção precisou ser criado/alterado neste QA.
