import { asc, count, eq } from 'drizzle-orm';
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
import { DrizzleTenantScopedRepositoryBase } from '../../../../shared-kernel/tenant/drizzle-tenant-scoped-repository-base.js';
import type { TenantContext } from '../../../../shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import { orcamentos, orcamentosHistorico } from './schema/orcamento.schema.js';

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
    // (spec 007, T018) `tenant_id` é `notNull` no schema desde 0013 — sem
    // reconstituir aqui, todo agregado carregado sai com `tenantId` undefined e
    // as guardas de isolamento de `ConsultarStatusOrcamento`/`ClassificarOrcamento`
    // o tratam como registro legado pré-retrofit: 404 em toda consulta e mensagem
    // descartada como sucesso idempotente. Mesmo mapeamento dos 4 BCs irmãos.
    tenantId: TenantId.de(linha.tenantId),
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
 *
 * **ADR-005 (retrofit, T018)**: estende `DrizzleTenantScopedRepositoryBase`
 * (spec 007/T008) — toda transação usa `transacaoTenantScoped`, que executa
 * `SET LOCAL app.current_tenant_id` a partir do `TenantContext` fixado nesta
 * instância antes de qualquer SELECT/INSERT. A política `tenant_isolation`
 * (T007) nega toda linha sem isso, mesmo que um método futuro esqueça de
 * filtrar por `tenant_id` explicitamente — a RLS é a garantia final, não o
 * filtro de Application. Uma instância deste repositório por
 * requisição/chamada, nunca um singleton reaproveitado entre tenants — ver
 * `CriarOrcamentoRepositorio` (domain/repositories/orcamento.repository.ts),
 * usada pelos 4 casos de uso deste BC para construir a instância certa a
 * partir do `tenantId` de cada chamada.
 */
export class DrizzleOrcamentoRepository
  extends DrizzleTenantScopedRepositoryBase
  implements OrcamentoRepository
{
  private readonly tenantId: string;

  constructor(db: NodePgDatabase, tenantContext: TenantContext) {
    super(db, tenantContext);
    this.tenantId = tenantContext.tenantId.toString();
  }

  async salvar(orcamento: Orcamento): Promise<void> {
    const resultado = orcamento.resultadoAtual?.paraPayload();

    await this.transacaoTenantScoped(async (tx) => {
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
          tenantId: this.tenantId,
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
          tenantId: this.tenantId,
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
    return this.transacaoTenantScoped(async (tx) => {
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
