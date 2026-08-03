import type { FastifyInstance } from 'fastify';
import {
  ConsultarStatusValidacao,
  OrcamentoValidacaoNaoEncontradoError,
} from '../../application/use-cases/consultar-status-validacao.js';
import type { OrcamentoValidacao } from '../../domain/orcamento-validacao.aggregate.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import type { RotaOpts } from './route-opts.js';
import { orcamentoIdParamSchema, statusValidacaoResponseSchema } from './status.schema.js';
import type { ProblemDetails, StatusValidacaoResponse } from './status.schema.js';

/** Traduz o agregado para o contrato de resposta (T026/#136). */
export function paraResposta(orcamentoValidacao: OrcamentoValidacao): StatusValidacaoResponse {
  return statusValidacaoResponseSchema.parse({
    orcamentoId: orcamentoValidacao.orcamentoId.toString(),
    status: orcamentoValidacao.status,
    inconsistencias: orcamentoValidacao.inconsistencias.map((i) => i.paraPayload()),
    historico: orcamentoValidacao.historico.map((tentativa) => ({
      resultado: tentativa.resultado,
      inconsistencias: tentativa.inconsistencias.map((i) => i.paraPayload()),
      timestamp: tentativa.timestamp.toISOString(),
      ...(tentativa.justificativa !== undefined ? { justificativa: tentativa.justificativa } : {}),
    })),
  });
}

/**
 * Controller (T026/#136): `GET /v1/orcamentos/{orcamentoId}/validacao/status`.
 * Recebe `ConsultarStatusValidacao` já construído — quem instancia o
 * repositório concreto (`DrizzleOrcamentoValidacaoRepository`, T014) é a
 * composição raiz do handler Lambda, fora deste arquivo. Autenticação
 * Cognito (T027, `criarAutenticacaoCognito`) é injetada via
 * `opts.preHandler`.
 */
export function registrarRotaStatusValidacao(
  app: FastifyInstance,
  consultarStatusValidacao: ConsultarStatusValidacao,
  opts: RotaOpts = {},
): void {
  app.get(
    '/v1/orcamentos/:orcamentoId/validacao/status',
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
        const orcamentoValidacao = await consultarStatusValidacao.executar(params.data.orcamentoId);
        await reply.status(200).send(paraResposta(orcamentoValidacao));
      } catch (erro) {
        if (
          erro instanceof OrcamentoValidacaoNaoEncontradoError ||
          erro instanceof OrcamentoIdInvalidoError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/nao-encontrado',
            title: 'Validação não encontrada',
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
