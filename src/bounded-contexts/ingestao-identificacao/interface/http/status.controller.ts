import type { FastifyInstance } from 'fastify';
import type { Orcamento } from '../../domain/orcamento.aggregate.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import {
  ConsultarStatusOrcamento,
  OrcamentoNaoEncontradoError,
} from '../../application/use-cases/consultar-status-orcamento.js';
import type { ProblemDetails, StatusIngestaoResponse } from './status.schema.js';
import { orcamentoIdParamSchema, statusIngestaoResponseSchema } from './status.schema.js';

function paraResposta(orcamento: Orcamento): StatusIngestaoResponse {
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
): void {
  app.get('/v1/orcamentos/:orcamentoId/status', async (request, reply) => {
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
      const orcamento = await consultarStatusOrcamento.executar(params.data.orcamentoId);
      await reply.status(200).send(paraResposta(orcamento));
    } catch (erro) {
      if (erro instanceof OrcamentoNaoEncontradoError || erro instanceof OrcamentoIdInvalidoError) {
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
  });
}
