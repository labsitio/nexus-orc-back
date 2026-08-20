import type { FastifyInstance } from 'fastify';
import {
  ConsultarStatusDecisaoWorkflow,
  DecisaoWorkflowNaoEncontradaError,
  TenantDivergenciaError,
} from '../../application/use-cases/consultar-status-decisao-workflow.js';
import type { DecisaoWorkflow } from '../../domain/aggregates/decisao-workflow.aggregate.js';
import type { DecisaoRoteamento } from '../../domain/value-objects/decisao-roteamento.vo.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import type { TentativaDecisaoWorkflow } from '../../domain/value-objects/tentativa-decisao-workflow.vo.js';
import type { RotaOpts } from './route-opts.js';
import { orcamentoIdParamSchema, statusDecisaoWorkflowResponseSchema } from './status.schema.js';
import type { ProblemDetails, StatusDecisaoWorkflowResponse } from './status.schema.js';

function paraDecisaoRoteamentoResposta(decisao: DecisaoRoteamento) {
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

function paraTentativaResposta(tentativa: TentativaDecisaoWorkflow) {
  return {
    agente: tentativa.agente,
    timestamp: tentativa.timestamp.toISOString(),
    ...(tentativa.resultado !== undefined
      ? { resultado: paraDecisaoRoteamentoResposta(tentativa.resultado) }
      : {}),
    ...(tentativa.motivoInsucesso !== undefined
      ? { motivoInsucesso: tentativa.motivoInsucesso }
      : {}),
  };
}

/** Traduz o agregado para o contrato de resposta (T030/#236). */
export function paraResposta(decisaoWorkflow: DecisaoWorkflow): StatusDecisaoWorkflowResponse {
  return statusDecisaoWorkflowResponseSchema.parse({
    orcamentoId: decisaoWorkflow.orcamentoId.toString(),
    status: decisaoWorkflow.status,
    ...(decisaoWorkflow.contextoClassificacao !== undefined
      ? { contextoClassificacao: decisaoWorkflow.contextoClassificacao }
      : {}),
    ...(decisaoWorkflow.contextoExtracao !== undefined
      ? { contextoExtracao: decisaoWorkflow.contextoExtracao }
      : {}),
    ...(decisaoWorkflow.contextoValidacao !== undefined
      ? {
          contextoValidacao: {
            resultado: decisaoWorkflow.contextoValidacao.resultado,
            inconsistenciasAceitas: decisaoWorkflow.contextoValidacao.inconsistenciasAceitas,
          },
        }
      : {}),
    ...(decisaoWorkflow.decisaoAtual !== undefined
      ? { decisaoAtual: paraDecisaoRoteamentoResposta(decisaoWorkflow.decisaoAtual) }
      : {}),
    historico: decisaoWorkflow.historico.map(paraTentativaResposta),
  });
}

/**
 * Controller (T030/#236): `GET /v1/orcamentos/{orcamentoId}/workflow/status`.
 * Recebe `ConsultarStatusDecisaoWorkflow` já construído — quem instancia o
 * repositório concreto (`DrizzleDecisaoWorkflowRepository`, T016) é a
 * composição raiz do handler Lambda, fora deste arquivo (mesmo padrão de
 * `validacao/interface/http/status.controller.ts`). Autenticação Cognito
 * (ADR-017, `criarTenantContextMiddleware`) é injetada via `opts.preHandler`.
 */
export function registrarRotaStatusDecisaoWorkflow(
  app: FastifyInstance,
  consultarStatusDecisaoWorkflow: ConsultarStatusDecisaoWorkflow,
  opts: RotaOpts = {},
): void {
  app.get(
    '/v1/orcamentos/:orcamentoId/workflow/status',
    { preHandler: opts.preHandler },
    async (request, reply) => {
      const params = orcamentoIdParamSchema.safeParse(request.params);
      if (!params.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/orquestracao',
          title: 'orcamentoId inválido',
          status: 400,
          detail: params.error.issues.map((i) => i.message).join('; '),
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      try {
        // `request.tenantContext` é populado por `TenantContextMiddleware` a
        // partir do JWT Cognito. Nunca vem de query/path/body — isso seria
        // escalação de privilégio. Middleware retorna 401 se ausente/inválido
        // antes de chegar aqui.
        const tenantId = request.tenantContext?.tenantId;
        if (!tenantId) {
          // Não deveria acontecer: TenantContextMiddleware já rejeitou. Fallback defensivo.
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/nao-autenticado',
            title: 'Contexto de tenant ausente',
            status: 401,
          };
          await reply.status(401).type('application/problem+json').send(problema);
          return;
        }

        const decisaoWorkflow = await consultarStatusDecisaoWorkflow.executar(
          params.data.orcamentoId,
          tenantId,
        );
        await reply.status(200).send(paraResposta(decisaoWorkflow));
      } catch (erro) {
        if (
          erro instanceof DecisaoWorkflowNaoEncontradaError ||
          erro instanceof OrcamentoIdInvalidoError ||
          erro instanceof TenantDivergenciaError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/nao-encontrado',
            title: 'Decisão de workflow não encontrada',
            status: 404,
          };
          await reply.status(404).type('application/problem+json').send(problema);
          return;
        }
        throw erro;
      }
    },
  );
}
