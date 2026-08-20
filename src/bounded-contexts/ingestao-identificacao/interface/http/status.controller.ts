import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { Orcamento } from '../../domain/orcamento.aggregate.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import {
  ConsultarStatusOrcamento,
  OrcamentoNaoEncontradoError,
  TenantDivergenciaError,
} from '../../application/use-cases/consultar-status-orcamento.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';
import { emitirMetrica } from '../../infrastructure/observability/metrica.js';
import type { RotaOpts } from './route-opts.js';
import type { ProblemDetails, StatusIngestaoResponse } from './status.schema.js';
import { orcamentoIdParamSchema, statusIngestaoResponseSchema } from './status.schema.js';

/** Reusado por `revisao-humana.controller.ts` (T053/#58) — mesmo shape de resposta. */
export function paraResposta(orcamento: Orcamento): StatusIngestaoResponse {
  return statusIngestaoResponseSchema.parse({
    orcamentoId: orcamento.id.toString(),
    canal: orcamento.canal.toString(),
    status: orcamento.status,
    resultadoAtual: orcamento.resultadoAtual?.paraPayload() ?? null,
    historico: orcamento.historico.map((tentativa) => ({
      agente: tentativa.agente,
      ocorreuEm: tentativa.timestamp.toISOString(),
      resultado: tentativa.resultado?.paraPayload() ?? null,
      motivoInsucesso: tentativa.motivoInsucesso ?? null,
    })),
  });
}

/**
 * Controller (T047/#52): `GET /v1/orcamentos/{orcamentoId}/status`.
 * Recebe `ConsultarStatusOrcamento` (T046/#51) já construído — quem instancia
 * o repositório concreto (`DrizzleOrcamentoRepository`, T011/#16) é a
 * composição raiz do handler Lambda, fora deste arquivo.
 */
export function registrarRotaStatusOrcamento(
  app: FastifyInstance,
  consultarStatusOrcamento: ConsultarStatusOrcamento,
  opts: RotaOpts = {},
  logger: Logger = criarLogger({ handler: 'status-orcamento' }),
): void {
  app.get(
    '/v1/orcamentos/:orcamentoId/status',
    { preHandler: opts.preHandler },
    async (request, reply) => {
      const params = orcamentoIdParamSchema.safeParse(request.params);
      if (!params.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title: 'orcamentoId inválido',
          status: 400,
          detail: params.error.issues.map((i) => i.message).join('; '),
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      try {
        // (spec 007, T017) `request.tenantContext` é populado por `TenantContextMiddleware`
        // a partir do JWT Cognito. Nunca vem de query/path/body — isso seria escalação
        // de privilégio. Middleware retorna 401 se ausente/inválido antes de chegar aqui.
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

        const orcamento = await consultarStatusOrcamento.executar(
          params.data.orcamentoId,
          tenantId,
        );
        await reply.status(200).send(paraResposta(orcamento));
      } catch (erro) {
        if (erro instanceof TenantDivergenciaError && erro.motivo === 'AUSENTE') {
          // (T049/#54, ADR-016) Métrica "percentual de orçamentos sem status
          // consultável" (spec 001, Métricas de Avaliação Contínua) — deve
          // ser 0% a qualquer momento. Só o motivo 'AUSENTE' é anomalia real
          // (orçamento recebido, mas estruturalmente inconsultável);
          // 'DIVERGENTE' é acesso corretamente negado (cross-tenant).
          emitirMetrica(logger, 'OrcamentoSemStatusConsultavel', 1);
        }
        if (
          erro instanceof OrcamentoNaoEncontradoError ||
          erro instanceof OrcamentoIdInvalidoError ||
          erro instanceof TenantDivergenciaError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/nao-encontrado',
            title: 'Orçamento não encontrado',
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
