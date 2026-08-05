import { asc, count, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  ExtracaoOrcamento,
  type ExtracaoOrcamentoProps,
  type StatusExtracao,
} from '../../domain/extracao-orcamento.aggregate.js';
import type { ExtracaoOrcamentoRepository } from '../../domain/repositories/extracao-orcamento.repository.js';
import {
  CampoExtraido,
  type AgenteOrigemCampo,
  type CampoExtraidoPayload,
} from '../../domain/value-objects/campo-extraido.vo.js';
import {
  CondicoesComerciais,
  type CondicoesComerciaisPayload,
} from '../../domain/value-objects/condicoes-comerciais.vo.js';
import { Dinheiro, type DinheiroPayload } from '../../domain/value-objects/dinheiro.vo.js';
import {
  DescricaoProduto,
  type DescricaoProdutoPayload,
} from '../../domain/value-objects/descricao-produto.vo.js';
import {
  ItemOrcamento,
  type ItemOrcamentoPayload,
} from '../../domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../../domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../domain/value-objects/periodo-validade.vo.js';
import { Quantidade } from '../../domain/value-objects/quantidade.vo.js';
import {
  ReferenciaClassificacao,
  type AgenteOrigemClassificacao,
} from '../../domain/value-objects/referencia-classificacao.vo.js';
import { ReferenciaS3 } from '../../domain/value-objects/referencia-s3.vo.js';
import { TentativaExtracao } from '../../domain/value-objects/tentativa-extracao.vo.js';
import { DrizzleTenantScopedRepositoryBase } from '../../../../shared-kernel/tenant/drizzle-tenant-scoped-repository-base.js';
import type { TenantContext } from '../../../../shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import {
  extracoesOrcamento,
  extracoesOrcamentoHistorico,
} from './schema/extracao-orcamento.schema.js';

/** Linha de `extracoes_orcamento`/histórico — nunca cruza para fora deste arquivo (T013). */
type LinhaExtracaoOrcamento = typeof extracoesOrcamento.$inferSelect;
type LinhaHistorico = typeof extracoesOrcamentoHistorico.$inferSelect;

/** Reconstrói `CampoExtraido<T>` a partir do payload JSONB — `hidratarValor` traduz o valor cru já desserializado. */
function campoDaPayload<T>(
  payload: CampoExtraidoPayload<unknown>,
  hidratarValor: (valorCru: unknown) => T,
): CampoExtraido<T> {
  const confianca = NivelConfianca.de(payload.confianca);
  return payload.extraido
    ? CampoExtraido.extraido(hidratarValor(payload.valor), confianca, payload.agenteOrigem)
    : CampoExtraido.naoExtraido<T>(confianca, payload.agenteOrigem);
}

function itemDoPayload(payload: ItemOrcamentoPayload): ItemOrcamento {
  return ItemOrcamento.de({
    descricao: campoDaPayload(payload.descricao, (v) => {
      const descricao = v as DescricaoProdutoPayload;
      return DescricaoProduto.de(descricao.descricao, descricao.sku);
    }),
    quantidade: campoDaPayload(payload.quantidade, (v) => Quantidade.de(v as number)),
    precoUnitario: campoDaPayload(payload.precoUnitario, (v) => {
      const dinheiro = v as DinheiroPayload;
      return Dinheiro.de(dinheiro.valorCentavos, dinheiro.moeda);
    }),
  });
}

function condicoesComerciaisDaLinha(
  linha: LinhaExtracaoOrcamento,
): CondicoesComerciais | undefined {
  if (linha.condicoesComerciais === null) {
    return undefined;
  }
  const payload = linha.condicoesComerciais as CondicoesComerciaisPayload;
  return CondicoesComerciais.de({
    condicoesPagamento: campoDaPayload(payload.condicoesPagamento, (v) => v as string),
    prazoValidade: campoDaPayload(payload.prazoValidade, (v) =>
      PeriodoValidade.de(new Date(v as string)),
    ),
    condicoesEntrega: campoDaPayload(payload.condicoesEntrega, (v) => v as string),
  });
}

function tentativaDaLinha(linha: LinhaHistorico): TentativaExtracao {
  const agente = linha.agente as AgenteOrigemCampo;
  return linha.resultado !== null
    ? TentativaExtracao.sucesso(agente, linha.resultado, linha.ocorreuEm)
    : // CHECK `extracoes_orcamento_historico_sucesso_xor_insucesso` garante não-nulo aqui.
      TentativaExtracao.insucesso(agente, linha.motivoInsucesso!, linha.ocorreuEm);
}

function agregadoDaLinha(
  linha: LinhaExtracaoOrcamento,
  historico: readonly TentativaExtracao[],
): ExtracaoOrcamento {
  const itensPayload = linha.itens as ItemOrcamentoPayload[];
  const props: ExtracaoOrcamentoProps = {
    orcamentoId: OrcamentoId.de(linha.id),
    referenciaClassificacao: ReferenciaClassificacao.de({
      fornecedorIdentificado: linha.referenciaClassificacaoFornecedorIdentificado,
      formatoIdentificado: linha.referenciaClassificacaoFormatoIdentificado,
      agenteOrigem: linha.referenciaClassificacaoAgenteOrigem as AgenteOrigemClassificacao,
    }),
    referenciaBrutaS3: ReferenciaS3.de({
      bucket: linha.referenciaBrutaS3Bucket,
      key: linha.referenciaBrutaS3Key,
      versionId: linha.referenciaBrutaS3VersionId,
    }),
    status: linha.status as StatusExtracao,
    itens: itensPayload.map(itemDoPayload),
    condicoesComerciais: condicoesComerciaisDaLinha(linha),
    historico,
    tenantId: TenantId.de(linha.tenantId),
  };
  return ExtracaoOrcamento.reconstituir(props);
}

/**
 * Implementa `ExtracaoOrcamentoRepository` sobre Aurora Serverless v2 Postgres
 * via Drizzle (ADR-001 herdado). Traduz linha↔agregado — nenhum tipo de linha
 * (`LinhaExtracaoOrcamento`/`LinhaHistorico`) nem o payload JSONB bruto de
 * `itens`/`condicoesComerciais` escapa deste arquivo (T013).
 *
 * `extracoes_orcamento_historico` é append-only (T012): `salvar` nunca
 * UPDATE/DELETE nessa tabela, apenas insere as tentativas ainda não
 * persistidas — mesmo padrão de `DrizzleOrcamentoRepository` (spec 001,
 * T011), incluindo o lock `FOR UPDATE` que serializa `salvar` concorrente do
 * mesmo agregado (retry de handler Lambda sobre a mesma mensagem SQS).
 *
 * **Issue #656 (retrofit)**: estende `DrizzleTenantScopedRepositoryBase`
 * (spec 007/T008) — toda transação usa `transacaoTenantScoped`, mesmo padrão
 * de `DrizzleOrcamentoRepository` (spec 001, T018). Uma instância por
 * chamada, nunca um singleton reaproveitado entre tenants — ver
 * `CriarExtracaoOrcamentoRepositorio`.
 */
export class DrizzleExtracaoOrcamentoRepository
  extends DrizzleTenantScopedRepositoryBase
  implements ExtracaoOrcamentoRepository
{
  private readonly tenantId: string;

  constructor(db: NodePgDatabase, tenantContext: TenantContext) {
    super(db, tenantContext);
    this.tenantId = tenantContext.tenantId.toString();
  }

  async salvar(extracao: ExtracaoOrcamento): Promise<void> {
    const itensPayload = extracao.itens.map((item) => item.paraPayload());
    const condicoesComerciaisPayload = extracao.condicoesComerciais?.paraPayload() ?? null;

    await this.transacaoTenantScoped(async (tx) => {
      // Serializa `salvar` concorrente do mesmo agregado — sem este lock, duas
      // transações poderiam ler a mesma contagem de histórico já persistida e
      // duplicar a mesma tentativa nova. Linha inexistente (1º save) não
      // bloqueia nada.
      await tx
        .select()
        .from(extracoesOrcamento)
        .where(eq(extracoesOrcamento.id, extracao.orcamentoId.toString()))
        .for('update');

      const referenciaClassificacao = extracao.referenciaClassificacao;
      const referenciaBrutaS3 = extracao.referenciaBrutaS3;

      await tx
        .insert(extracoesOrcamento)
        .values({
          id: extracao.orcamentoId.toString(),
          // (issue #656) `tenantId` é imutável após a criação — nunca entra
          // no `set` do onConflictDoUpdate abaixo (mesmo padrão de
          // `DrizzleOrcamentoRepository`, spec 001, T011).
          tenantId: this.tenantId,
          status: extracao.status,
          referenciaClassificacaoFornecedorIdentificado:
            referenciaClassificacao.fornecedorIdentificado,
          referenciaClassificacaoFormatoIdentificado: referenciaClassificacao.formatoIdentificado,
          referenciaClassificacaoAgenteOrigem: referenciaClassificacao.agenteOrigem,
          referenciaBrutaS3Bucket: referenciaBrutaS3.bucket,
          referenciaBrutaS3Key: referenciaBrutaS3.key,
          referenciaBrutaS3VersionId: referenciaBrutaS3.versionId,
          itens: itensPayload,
          condicoesComerciais: condicoesComerciaisPayload,
        })
        .onConflictDoUpdate({
          target: extracoesOrcamento.id,
          set: {
            status: extracao.status,
            itens: itensPayload,
            condicoesComerciais: condicoesComerciaisPayload,
          },
        });

      const [contagem] = await tx
        .select({ jaPersistidas: count() })
        .from(extracoesOrcamentoHistorico)
        .where(
          eq(extracoesOrcamentoHistorico.extracaoOrcamentoId, extracao.orcamentoId.toString()),
        );

      const novasTentativas = extracao.historico.slice(contagem?.jaPersistidas ?? 0);
      if (novasTentativas.length === 0) {
        return;
      }

      await tx.insert(extracoesOrcamentoHistorico).values(
        novasTentativas.map((tentativa) => ({
          extracaoOrcamentoId: extracao.orcamentoId.toString(),
          tenantId: this.tenantId,
          agente: tentativa.agente,
          ocorreuEm: tentativa.timestamp,
          resultado: tentativa.resultado ?? null,
          motivoInsucesso: tentativa.motivoInsucesso ?? null,
        })),
      );
    });
  }

  async buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<ExtracaoOrcamento | undefined> {
    return this.transacaoTenantScoped(async (tx) => {
      const [linha] = await tx
        .select()
        .from(extracoesOrcamento)
        .where(eq(extracoesOrcamento.id, orcamentoId.toString()));
      if (!linha) {
        return undefined;
      }

      const linhasHistorico = await tx
        .select()
        .from(extracoesOrcamentoHistorico)
        .where(eq(extracoesOrcamentoHistorico.extracaoOrcamentoId, orcamentoId.toString()))
        .orderBy(asc(extracoesOrcamentoHistorico.ocorreuEm), asc(extracoesOrcamentoHistorico.id));

      return agregadoDaLinha(linha, linhasHistorico.map(tentativaDaLinha));
    });
  }
}
