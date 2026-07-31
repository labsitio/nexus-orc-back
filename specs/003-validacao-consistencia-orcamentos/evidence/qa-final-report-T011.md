# QA Final Report — T011 (Domain Events, BC validacao)

## SPEC_ID / versão testada
003-validacao-consistencia-orcamentos, branch `feat/003-validacao`, commit `7434c27`, PR #455.

## Resumo executivo
T011 adiciona 3 Domain Events (`OrcamentoValidado`, `OrcamentoInconsistenciaDetectada`,
`OrcamentoValidadoComRessalva`) + envelope local `DomainEventEnvelope`. Diff pequeno,
padrão replicado dos BCs `extracao`/`ingestao-identificacao`. Sem código de produção
tocado além dos 4 arquivos de evento.

## Requisitos cobertos
- schemaVersion fixo em 1 para os 3 eventos — coberto.
- `detailType` correto por evento — coberto.
- `orcamentoId` propagado do construtor — coberto.
- `ocorreuEm` como ISO string válida — coberto.
- `inconsistencias` (lista da tentativa atual) propagada em
  `OrcamentoInconsistenciaDetectada` e `OrcamentoValidadoComRessalva` — coberto.
- `source: nexo.validacao` — fora de escopo desta task (fixado na Infra, T016).

Lacuna: nenhuma. Task é puramente estrutural (VOs/eventos de domínio), sem branch
de decisão a testar além do que já está coberto.

## Suítes executadas
- `pnpm vitest run tests/bounded-contexts/validacao/domain/events/` → 1 arquivo, 5 testes, todos passando.
- `pnpm typecheck` (`tsc --noEmit`) → sem erros.
- `pnpm lint` (`eslint .`) → sem erros.

## Resultado
Aprovados: 5. Falhos: 0. Ignorados: 0. Instáveis: 0.

## Cobertura
Não medida via relatório de cobertura dedicado (comando de cobertura do projeto
não solicitado nesta rodada); os 3 eventos têm 100% das linhas exercitadas pelos
5 casos de teste existentes (todo branch/campo público é asserido).

## Allure
Não gerado nesta rodada (fora do escopo de velocidade solicitado); resultado de
teste documentado diretamente neste relatório.

## Bugs
Nenhum encontrado.

## Riscos residuais
- `source: nexo.validacao` só será verificável quando T016 (Infra) publicar o evento
  de fato — QA deve revisitar no handoff dessa task.

## Limitações do ambiente
Nenhuma.

## Parecer final
APROVADO PELO QA
