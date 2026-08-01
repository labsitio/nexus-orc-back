import { asc, count, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  DecisaoWorkflow,
  type DecisaoWorkflowProps,
  type StatusDecisaoWorkflow,
} from '../../domain/aggregates/decisao-workflow.aggregate.js';
import {
  ContextoClassificacao,
  type ContextoClassificacaoParams,
} from '../../domain/value-objects/contexto-classificacao.vo.js';
import {
  ContextoExtracao,
  type ContextoExtracaoParams,
} from '../../domain/value-objects/contexto-extracao.vo.js';
import {
  ContextoValidacao,
  type ContextoValidacaoParams,
} from '../../domain/value-objects/contexto-validacao.vo.js';
import {
  DecisaoRoteamento,
  type AcaoRoteamento,
  type AgenteOrigemDecisao,
} from '../../domain/value-objects/decisao-roteamento.vo.js';
import { NivelConfianca } from '../../domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { TentativaDecisaoWorkflow } from '../../domain/value-objects/tentativa-decisao-workflow.vo.js';
import type { DecisaoWorkflowRepository } from '../../domain/repositories/decisao-workflow.repository.js';
import { decisoesWorkflow, decisoesWorkflowHistorico } from './schema/decisao-workflow.schema.js';

/** Linha de `decisoes_workflow`/histórico — nunca cruza para fora deste arquivo (T016). */
type LinhaDecisaoWorkflow = typeof decisoesWorkflow.$inferSelect;
type LinhaHistorico = typeof decisoesWorkflowHistorico.$inferSelect;

/** Payload JSONB de `DecisaoRoteamento` — `nivelConfianca` reduzido ao número bruto, nunca ao VO. */
interface DecisaoRoteamentoPayload {
  readonly acao: AcaoRoteamento;
  readonly nivelConfianca: number | null;
  readonly criterio: string;
  readonly agenteOrigem: AgenteOrigemDecisao;
  readonly requerIntegracaoExterna: boolean;
  readonly motivoDadoAusente?: string;
}

function decisaoRoteamentoParaPayload(decisao: DecisaoRoteamento): DecisaoRoteamentoPayload {
  return {
    acao: decisao.acao,
    nivelConfianca: decisao.nivelConfianca?.valor ?? null,
    criterio: decisao.criterio,
    agenteOrigem: decisao.agenteOrigem,
    requerIntegracaoExterna: decisao.requerIntegracaoExterna,
    ...(decisao.motivoDadoAusente !== undefined
      ? { motivoDadoAusente: decisao.motivoDadoAusente }
      : {}),
  };
}

/**
 * Reidrata `DecisaoRoteamento` a partir do payload persistido via
 * `reconstituir` — nunca revalida as invariantes de negócio de `criar`
 * (nunca aprovar sem validação bem-sucedida, nunca reenvio sem fundamento,
 * nunca decisão automática sem critério): dado já persistido já as
 * satisfez no momento da decisão, revalidar na leitura acoplaria a
 * releitura de decisão histórica à regra de negócio atual.
 */
function decisaoRoteamentoDaLinha(payload: DecisaoRoteamentoPayload): DecisaoRoteamento {
  return DecisaoRoteamento.reconstituir({
    acao: payload.acao,
    nivelConfianca:
      payload.nivelConfianca !== null ? NivelConfianca.de(payload.nivelConfianca) : null,
    criterio: payload.criterio,
    agenteOrigem: payload.agenteOrigem,
    requerIntegracaoExterna: payload.requerIntegracaoExterna,
    ...(payload.motivoDadoAusente !== undefined
      ? { motivoDadoAusente: payload.motivoDadoAusente }
      : {}),
  });
}

function contextoClassificacaoDaLinha(
  linha: LinhaDecisaoWorkflow,
): ContextoClassificacao | undefined {
  if (!linha.contextoClassificacao) {
    return undefined;
  }
  return ContextoClassificacao.de(linha.contextoClassificacao as ContextoClassificacaoParams);
}

function contextoExtracaoDaLinha(linha: LinhaDecisaoWorkflow): ContextoExtracao | undefined {
  if (!linha.contextoExtracao) {
    return undefined;
  }
  return ContextoExtracao.de(linha.contextoExtracao as ContextoExtracaoParams);
}

function contextoValidacaoDaLinha(linha: LinhaDecisaoWorkflow): ContextoValidacao | undefined {
  if (!linha.contextoValidacao) {
    return undefined;
  }
  return ContextoValidacao.de(linha.contextoValidacao as ContextoValidacaoParams);
}

function tentativaDaLinha(linha: LinhaHistorico): TentativaDecisaoWorkflow {
  return TentativaDecisaoWorkflow.de({
    agente: linha.agente as AgenteOrigemDecisao,
    timestamp: linha.ocorreuEm,
    ...(linha.resultado !== null
      ? { resultado: decisaoRoteamentoDaLinha(linha.resultado as DecisaoRoteamentoPayload) }
      : {}),
    ...(linha.motivoInsucesso !== null ? { motivoInsucesso: linha.motivoInsucesso } : {}),
  });
}

function agregadoDaLinha(
  linha: LinhaDecisaoWorkflow,
  historico: readonly TentativaDecisaoWorkflow[],
): DecisaoWorkflow {
  const contextoClassificacao = contextoClassificacaoDaLinha(linha);
  const contextoExtracao = contextoExtracaoDaLinha(linha);
  const contextoValidacao = contextoValidacaoDaLinha(linha);
  const decisaoAtual = linha.decisaoAtual
    ? decisaoRoteamentoDaLinha(linha.decisaoAtual as DecisaoRoteamentoPayload)
    : undefined;

  const props: DecisaoWorkflowProps = {
    orcamentoId: OrcamentoId.de(linha.id),
    status: linha.status as StatusDecisaoWorkflow,
    historico,
    ...(contextoClassificacao !== undefined ? { contextoClassificacao } : {}),
    ...(contextoExtracao !== undefined ? { contextoExtracao } : {}),
    ...(contextoValidacao !== undefined ? { contextoValidacao } : {}),
    ...(decisaoAtual !== undefined ? { decisaoAtual } : {}),
  };
  return DecisaoWorkflow.reconstituir(props);
}

/**
 * Implementa `DecisaoWorkflowRepository` sobre Aurora Serverless v2 Postgres
 * via Drizzle (ADR-001 herdado). Traduz linha↔agregado — nenhum tipo de
 * linha (`LinhaDecisaoWorkflow`/`LinhaHistorico`) nem o payload JSONB bruto
 * dos contextos/decisão escapa deste arquivo (plan.md).
 *
 * `decisoes_workflow_historico` é append-only (T015): `salvar` nunca
 * UPDATE/DELETE nessa tabela, apenas insere as tentativas ainda não
 * persistidas — mesmo padrão de `DrizzleOrcamentoValidacaoRepository`
 * (spec 003, T014) e `DrizzleExtracaoOrcamentoRepository` (spec 002, T013),
 * incluindo o lock `FOR UPDATE` que serializa `salvar` concorrente do mesmo
 * agregado (retry de handler Lambda sobre a mesma mensagem SQS/reentrega de
 * evento upstream).
 */
export class DrizzleDecisaoWorkflowRepository implements DecisaoWorkflowRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async salvar(decisaoWorkflow: DecisaoWorkflow): Promise<void> {
    const id = decisaoWorkflow.orcamentoId.toString();
    const contextoClassificacaoPayload = decisaoWorkflow.contextoClassificacao ?? null;
    const contextoExtracaoPayload = decisaoWorkflow.contextoExtracao ?? null;
    const contextoValidacaoPayload = decisaoWorkflow.contextoValidacao ?? null;
    const decisaoAtualPayload = decisaoWorkflow.decisaoAtual
      ? decisaoRoteamentoParaPayload(decisaoWorkflow.decisaoAtual)
      : null;

    await this.db.transaction(async (tx) => {
      // Serializa `salvar` concorrente do mesmo agregado — sem este lock, duas
      // transações poderiam ler a mesma contagem de histórico já persistida e
      // duplicar a mesma tentativa nova. Linha inexistente (1º save) não
      // bloqueia nada.
      await tx.select().from(decisoesWorkflow).where(eq(decisoesWorkflow.id, id)).for('update');

      await tx
        .insert(decisoesWorkflow)
        .values({
          id,
          status: decisaoWorkflow.status,
          contextoClassificacao: contextoClassificacaoPayload,
          contextoExtracao: contextoExtracaoPayload,
          contextoValidacao: contextoValidacaoPayload,
          decisaoAtual: decisaoAtualPayload,
        })
        .onConflictDoUpdate({
          target: decisoesWorkflow.id,
          set: {
            status: decisaoWorkflow.status,
            contextoClassificacao: contextoClassificacaoPayload,
            contextoExtracao: contextoExtracaoPayload,
            contextoValidacao: contextoValidacaoPayload,
            decisaoAtual: decisaoAtualPayload,
          },
        });

      const [contagem] = await tx
        .select({ jaPersistidas: count() })
        .from(decisoesWorkflowHistorico)
        .where(eq(decisoesWorkflowHistorico.decisaoWorkflowId, id));

      const novasTentativas = decisaoWorkflow.historico.slice(contagem?.jaPersistidas ?? 0);
      if (novasTentativas.length === 0) {
        return;
      }

      await tx.insert(decisoesWorkflowHistorico).values(
        novasTentativas.map((tentativa) => ({
          decisaoWorkflowId: id,
          agente: tentativa.agente,
          resultado: tentativa.resultado ? decisaoRoteamentoParaPayload(tentativa.resultado) : null,
          motivoInsucesso: tentativa.motivoInsucesso ?? null,
          ocorreuEm: tentativa.timestamp,
        })),
      );
    });
  }

  async buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<DecisaoWorkflow | undefined> {
    const [linha] = await this.db
      .select()
      .from(decisoesWorkflow)
      .where(eq(decisoesWorkflow.id, orcamentoId.toString()));
    if (!linha) {
      return undefined;
    }

    const linhasHistorico = await this.db
      .select()
      .from(decisoesWorkflowHistorico)
      .where(eq(decisoesWorkflowHistorico.decisaoWorkflowId, orcamentoId.toString()))
      .orderBy(asc(decisoesWorkflowHistorico.ocorreuEm), asc(decisoesWorkflowHistorico.id));

    return agregadoDaLinha(linha, linhasHistorico.map(tentativaDaLinha));
  }
}
