import { asc, count, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleTenantScopedRepositoryBase } from '../../../../shared-kernel/tenant/drizzle-tenant-scoped-repository-base.js';
import type { TenantContext } from '../../../../shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import {
  OrcamentoValidacao,
  type OrcamentoValidacaoProps,
  type StatusValidacao,
} from '../../domain/orcamento-validacao.aggregate.js';
import type { OrcamentoValidacaoRepository } from '../../domain/repositories/orcamento-validacao.repository.js';
import { CategoriaItem } from '../../domain/value-objects/categoria-item.vo.js';
import {
  DadosExtraidosParaValidacao,
  type DadosExtraidosParaValidacaoPayload,
} from '../../domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro, type DinheiroPayload } from '../../domain/value-objects/dinheiro.vo.js';
import {
  InconsistenciaDetectada,
  type InconsistenciaDetectadaPayload,
} from '../../domain/value-objects/inconsistencia-detectada.vo.js';
import {
  ItemParaValidacao,
  type ItemParaValidacaoPayload,
} from '../../domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../domain/value-objects/periodo-validade.vo.js';
import {
  TentativaValidacao,
  type ResultadoTentativaValidacao,
} from '../../domain/value-objects/tentativa-validacao.vo.js';
import {
  validacoesOrcamento,
  validacoesOrcamentoHistorico,
} from './schema/validacao-orcamento.schema.js';

/** Linha de `validacoes_orcamento`/histórico — nunca cruza para fora deste arquivo (T014). */
type LinhaValidacaoOrcamento = typeof validacoesOrcamento.$inferSelect;
type LinhaHistorico = typeof validacoesOrcamentoHistorico.$inferSelect;

function itemDoPayload(payload: ItemParaValidacaoPayload): ItemParaValidacao {
  const precoUnitario = payload.precoUnitario as DinheiroPayload;
  return ItemParaValidacao.de({
    quantidade: payload.quantidade,
    precoUnitario: Dinheiro.de(precoUnitario.valorCentavos, precoUnitario.moeda),
    extraido: payload.extraido,
    ...(payload.descricao !== undefined ? { descricao: payload.descricao } : {}),
    ...(payload.categoria !== undefined ? { categoria: CategoriaItem.de(payload.categoria) } : {}),
  });
}

function dadosExtraidosDaLinha(linha: LinhaValidacaoOrcamento): DadosExtraidosParaValidacao {
  const payload = linha.dadosExtraidos as DadosExtraidosParaValidacaoPayload;
  return DadosExtraidosParaValidacao.de({
    cnpjFornecedor: payload.cnpjFornecedor,
    itens: payload.itens.map(itemDoPayload),
    condicoesComerciais: payload.condicoesComerciais,
    dataEmissaoProposta: new Date(payload.dataEmissaoProposta),
    periodoValidade: PeriodoValidade.de(new Date(payload.periodoValidade)),
  });
}

function inconsistenciasDaLinha(inconsistencias: unknown): readonly InconsistenciaDetectada[] {
  return (inconsistencias as InconsistenciaDetectadaPayload[]).map((payload) =>
    InconsistenciaDetectada.de(payload.regra, payload.detalhe, payload.referenciaItem),
  );
}

function tentativaDaLinha(linha: LinhaHistorico): TentativaValidacao {
  return TentativaValidacao.de(
    linha.resultado as ResultadoTentativaValidacao,
    inconsistenciasDaLinha(linha.inconsistencias),
    linha.ocorreuEm,
  );
}

function agregadoDaLinha(
  linha: LinhaValidacaoOrcamento,
  historico: readonly TentativaValidacao[],
): OrcamentoValidacao {
  const props: OrcamentoValidacaoProps = {
    orcamentoId: OrcamentoId.de(linha.id),
    dadosExtraidos: dadosExtraidosDaLinha(linha),
    status: linha.status as StatusValidacao,
    inconsistencias: inconsistenciasDaLinha(linha.inconsistencias),
    historico,
    tenantId: TenantId.de(linha.tenantId),
  };
  return OrcamentoValidacao.reconstituir(props);
}

/**
 * Implementa `OrcamentoValidacaoRepository` sobre Aurora Serverless v2
 * Postgres via Drizzle (ADR-001 herdado). Traduz linha↔agregado — nenhum
 * tipo de linha (`LinhaValidacaoOrcamento`/`LinhaHistorico`) nem o payload
 * JSONB bruto de `dadosExtraidos`/`inconsistencias` escapa deste arquivo.
 *
 * `validacoes_orcamento_historico` é append-only (T013): `salvar` nunca
 * UPDATE/DELETE nessa tabela, apenas insere as tentativas ainda não
 * persistidas — mesmo padrão de `DrizzleExtracaoOrcamentoRepository`
 * (spec 002, T013), incluindo o lock `FOR UPDATE` que serializa `salvar`
 * concorrente do mesmo agregado (retry de handler Lambda sobre a mesma
 * mensagem SQS).
 */
export class DrizzleOrcamentoValidacaoRepository
  extends DrizzleTenantScopedRepositoryBase
  implements OrcamentoValidacaoRepository
{
  private readonly tenantId: string;

  constructor(db: NodePgDatabase, tenantContext: TenantContext) {
    super(db, tenantContext);
    this.tenantId = tenantContext.tenantId.toString();
  }

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    const id = orcamentoValidacao.orcamentoId.toString();
    const dadosExtraidosPayload = orcamentoValidacao.dadosExtraidos.paraPayload();
    const inconsistenciasPayload = orcamentoValidacao.inconsistencias.map((inconsistencia) =>
      inconsistencia.paraPayload(),
    );

    await this.transacaoTenantScoped(async (tx) => {
      // Serializa `salvar` concorrente do mesmo agregado — sem este lock, duas
      // transações poderiam ler a mesma contagem de histórico já persistida e
      // duplicar a mesma tentativa nova. Linha inexistente (1º save) não
      // bloqueia nada.
      await tx
        .select()
        .from(validacoesOrcamento)
        .where(eq(validacoesOrcamento.id, id))
        .for('update');

      await tx
        .insert(validacoesOrcamento)
        .values({
          id,
          // (issue #656) `tenantId` é imutável após a criação — nunca entra
          // no `set` do onConflictDoUpdate abaixo (mesmo padrão de
          // `DrizzleExtracaoOrcamentoRepository`, spec 002).
          tenantId: this.tenantId,
          status: orcamentoValidacao.status,
          dadosExtraidos: dadosExtraidosPayload,
          inconsistencias: inconsistenciasPayload,
        })
        .onConflictDoUpdate({
          target: validacoesOrcamento.id,
          set: {
            status: orcamentoValidacao.status,
            inconsistencias: inconsistenciasPayload,
          },
        });

      const [contagem] = await tx
        .select({ jaPersistidas: count() })
        .from(validacoesOrcamentoHistorico)
        .where(eq(validacoesOrcamentoHistorico.orcamentoValidacaoId, id));

      const novasTentativas = orcamentoValidacao.historico.slice(contagem?.jaPersistidas ?? 0);
      if (novasTentativas.length === 0) {
        return;
      }

      await tx.insert(validacoesOrcamentoHistorico).values(
        novasTentativas.map((tentativa) => ({
          orcamentoValidacaoId: id,
          tenantId: this.tenantId,
          resultado: tentativa.resultado,
          inconsistencias: tentativa.inconsistencias.map((inconsistencia) =>
            inconsistencia.paraPayload(),
          ),
          ocorreuEm: tentativa.timestamp,
        })),
      );
    });
  }

  async buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<OrcamentoValidacao | undefined> {
    return this.transacaoTenantScoped(async (tx) => {
      const [linha] = await tx
        .select()
        .from(validacoesOrcamento)
        .where(eq(validacoesOrcamento.id, orcamentoId.toString()));
      if (!linha) {
        return undefined;
      }

      const linhasHistorico = await tx
        .select()
        .from(validacoesOrcamentoHistorico)
        .where(eq(validacoesOrcamentoHistorico.orcamentoValidacaoId, orcamentoId.toString()))
        .orderBy(asc(validacoesOrcamentoHistorico.ocorreuEm), asc(validacoesOrcamentoHistorico.id));

      return agregadoDaLinha(linha, linhasHistorico.map(tentativaDaLinha));
    });
  }
}
