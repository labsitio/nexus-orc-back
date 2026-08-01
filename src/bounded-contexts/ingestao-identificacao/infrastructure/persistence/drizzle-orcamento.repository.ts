import { asc, count, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  Orcamento,
  type OrcamentoProps,
  type StatusOrcamento,
} from '../../domain/orcamento.aggregate.js';
import type { OrcamentoRepository } from '../../domain/repositories/orcamento.repository.js';
import { Canal } from '../../domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../domain/value-objects/referencia-s3.vo.js';
import {
  ResultadoClassificacao,
  type AgenteOrigem,
} from '../../domain/value-objects/resultado-classificacao.vo.js';
import { TentativaClassificacao } from '../../domain/value-objects/tentativa-classificacao.vo.js';
import { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import { orcamentos, orcamentosHistorico } from './schema/orcamento.schema.js';

/**
 * ponytail: placeholder até T008 (`DrizzleTenantScopedRepositoryBase`,
 * `SET LOCAL` a partir do `TenantContext` real) e T014/T016/T018 (spec 007,
 * `specs/007-isolamento-multitenant-dados/tasks.md`) propagarem o `tenantId`
 * real através de Domain/Application deste BC. T007 habilitou RLS
 * (`tenant_isolation`) em `orcamentos`/`orcamentos_historico` — sem
 * `SET LOCAL app.current_tenant_id`, a política nega toda leitura/escrita
 * deste repositório. Valor fixo mantém o comportamento single-tenant já
 * existente (nenhum tenant real em produção ainda, ADR-005) até a migração
 * completa deste BC ser concluída pelas tasks acima.
 */
const TENANT_ID_PROVISORIO = TenantId.de('00000000-0000-7000-8000-000000000000').toString();

/** Linha de `orcamentos` — nunca cruza para fora deste arquivo (plan.md, T011). */
type LinhaOrcamento = typeof orcamentos.$inferSelect;
type LinhaHistorico = typeof orcamentosHistorico.$inferSelect;

function resultadoDaLinha(campos: {
  fornecedor: string | null;
  formato: string | null;
  nivelConfianca: number | null;
  agenteOrigem: AgenteOrigem | null;
}): ResultadoClassificacao | undefined {
  if (
    campos.fornecedor === null ||
    campos.formato === null ||
    campos.nivelConfianca === null ||
    campos.agenteOrigem === null
  ) {
    return undefined;
  }
  return ResultadoClassificacao.criar({
    fornecedorIdentificado: campos.fornecedor,
    formatoIdentificado: campos.formato,
    nivelConfianca: NivelConfianca.de(campos.nivelConfianca),
    agenteOrigem: campos.agenteOrigem,
  });
}

function tentativaDaLinha(linha: LinhaHistorico): TentativaClassificacao {
  const resultado = resultadoDaLinha({
    fornecedor: linha.resultadoFornecedorIdentificado,
    formato: linha.resultadoFormatoIdentificado,
    nivelConfianca: linha.resultadoNivelConfianca,
    agenteOrigem: linha.agente,
  });
  return resultado
    ? TentativaClassificacao.sucesso(linha.agente, resultado, linha.ocorreuEm)
    : TentativaClassificacao.insucesso(
        linha.agente,
        // CHECK `orcamentos_historico_sucesso_xor_insucesso` garante não-nulo aqui.
        linha.motivoInsucesso!,
        linha.ocorreuEm,
      );
}

function agregadoDaLinha(
  linha: LinhaOrcamento,
  historico: readonly TentativaClassificacao[],
): Orcamento {
  const props: OrcamentoProps = {
    id: OrcamentoId.de(linha.id),
    canal: Canal.de(linha.canal),
    recebidoEm: linha.recebidoEm,
    referenciaBruta: ReferenciaS3.de({
      bucket: linha.bucket,
      key: linha.key,
      versionId: linha.versionId,
    }),
    referenciaExterna: linha.referenciaExterna ?? undefined,
    status: linha.status as StatusOrcamento,
    resultadoAtual: resultadoDaLinha({
      fornecedor: linha.resultadoFornecedorIdentificado,
      formato: linha.resultadoFormatoIdentificado,
      nivelConfianca: linha.resultadoNivelConfianca,
      agenteOrigem: linha.resultadoAgenteOrigem,
    }),
    historico,
  };
  return Orcamento.reconstituir(props);
}

/**
 * Implementa `OrcamentoRepository` sobre Aurora Serverless v2 Postgres via
 * Drizzle (ADR-001). Traduz linha↔agregado — nenhum tipo de linha
 * (`LinhaOrcamento`/`LinhaHistorico`) escapa deste arquivo.
 *
 * `orcamentos_historico` é append-only (T010): `salvar` nunca UPDATE/DELETE
 * nessa tabela, apenas insere as tentativas ainda não persistidas — a
 * contagem de linhas já gravadas para o `orcamentoId` define o que é novo,
 * assumindo o padrão de uso real (carregar via `buscarPorId`, aplicar no
 * máximo uma transição, salvar) documentado nos casos de uso da Application.
 */
export class DrizzleOrcamentoRepository implements OrcamentoRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async salvar(orcamento: Orcamento): Promise<void> {
    const resultado = orcamento.resultadoAtual?.paraPayload();

    await this.db.transaction(async (tx) => {
      // RLS (T007): sessão precisa de `app.current_tenant_id` antes de
      // qualquer SELECT/INSERT nestas tabelas — ver `TENANT_ID_PROVISORIO`.
      // `SET LOCAL` não aceita bind parameter para o valor (erro de sintaxe
      // do Postgres) — interpolação literal seguindo `sql.raw` é segura aqui
      // porque `TENANT_ID_PROVISORIO` já passou pela validação estrita de
      // formato UUID v7 de `TenantId.de` (nunca input externo).
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${TENANT_ID_PROVISORIO}'`));

      // Serializa `salvar` concorrente do mesmo agregado (ex.: retry de Lambda
      // + invocação original) — sem este lock, duas transações poderiam ler a
      // mesma contagem de `orcamentos_historico` e duplicar a mesma tentativa
      // nova. Linha inexistente (1º save) não bloqueia nada — sem risco, pois
      // o id é gerado uma única vez (UUID v7) no Gateway de Ingestão.
      await tx
        .select()
        .from(orcamentos)
        .where(eq(orcamentos.id, orcamento.id.toString()))
        .for('update');

      await tx
        .insert(orcamentos)
        .values({
          id: orcamento.id.toString(),
          tenantId: TENANT_ID_PROVISORIO,
          canal: orcamento.canal.valor,
          recebidoEm: orcamento.recebidoEm,
          bucket: orcamento.referenciaBruta.bucket,
          key: orcamento.referenciaBruta.key,
          versionId: orcamento.referenciaBruta.versionId,
          referenciaExterna: orcamento.referenciaExterna ?? null,
          status: orcamento.status,
          resultadoFornecedorIdentificado: resultado?.fornecedorIdentificado ?? null,
          resultadoFormatoIdentificado: resultado?.formatoIdentificado ?? null,
          resultadoNivelConfianca: resultado?.nivelConfianca ?? null,
          resultadoAgenteOrigem: resultado?.agenteOrigem ?? null,
        })
        .onConflictDoUpdate({
          target: orcamentos.id,
          set: {
            status: orcamento.status,
            resultadoFornecedorIdentificado: resultado?.fornecedorIdentificado ?? null,
            resultadoFormatoIdentificado: resultado?.formatoIdentificado ?? null,
            resultadoNivelConfianca: resultado?.nivelConfianca ?? null,
            resultadoAgenteOrigem: resultado?.agenteOrigem ?? null,
          },
        });

      const [contagem] = await tx
        .select({ jaPersistidas: count() })
        .from(orcamentosHistorico)
        .where(eq(orcamentosHistorico.orcamentoId, orcamento.id.toString()));

      const novasTentativas = orcamento.historico.slice(contagem?.jaPersistidas ?? 0);
      if (novasTentativas.length === 0) {
        return;
      }

      await tx.insert(orcamentosHistorico).values(
        novasTentativas.map((tentativa) => ({
          orcamentoId: orcamento.id.toString(),
          tenantId: TENANT_ID_PROVISORIO,
          agente: tentativa.agente,
          ocorreuEm: tentativa.timestamp,
          resultadoFornecedorIdentificado: tentativa.resultado?.fornecedorIdentificado ?? null,
          resultadoFormatoIdentificado: tentativa.resultado?.formatoIdentificado ?? null,
          resultadoNivelConfianca: tentativa.resultado?.nivelConfianca.valor ?? null,
          motivoInsucesso: tentativa.motivoInsucesso ?? null,
        })),
      );
    });
  }

  async buscarPorId(id: OrcamentoId): Promise<Orcamento | undefined> {
    return this.db.transaction(async (tx) => {
      // RLS (T007): mesma exigência de `SET LOCAL` do `salvar` — ver
      // `TENANT_ID_PROVISORIO`.
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${TENANT_ID_PROVISORIO}'`));

      const [linhaOrcamento] = await tx
        .select()
        .from(orcamentos)
        .where(eq(orcamentos.id, id.toString()));
      if (!linhaOrcamento) {
        return undefined;
      }

      const linhasHistorico = await tx
        .select()
        .from(orcamentosHistorico)
        .where(eq(orcamentosHistorico.orcamentoId, id.toString()))
        .orderBy(asc(orcamentosHistorico.ocorreuEm), asc(orcamentosHistorico.id));

      return agregadoDaLinha(linhaOrcamento, linhasHistorico.map(tentativaDaLinha));
    });
  }
}
