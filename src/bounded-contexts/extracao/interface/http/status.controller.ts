import type { FastifyInstance } from 'fastify';
import type { ExtracaoOrcamento } from '../../domain/extracao-orcamento.aggregate.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import {
  ConsultarStatusExtracao,
  ExtracaoNaoEncontradaError,
} from '../../application/use-cases/consultar-status-extracao.js';
import type { RotaOpts } from './route-opts.js';
import type { ProblemDetails, StatusExtracaoResponse } from './status.schema.js';
import { orcamentoIdParamSchema, statusExtracaoResponseSchema } from './status.schema.js';

/** Réplica mecânica de `paraResposta` (spec 001) — traduz o agregado para o contrato de borda. */
export function paraResposta(extracao: ExtracaoOrcamento): StatusExtracaoResponse {
  return statusExtracaoResponseSchema.parse({
    orcamentoId: extracao.orcamentoId.toString(),
    status: extracao.status,
    itens: extracao.itens.map((item) => item.paraPayload()),
    condicoesComerciais: extracao.condicoesComerciais?.paraPayload() ?? null,
    historico: extracao.historico.map((tentativa) => ({
      agente: tentativa.agente,
      ocorreuEm: tentativa.timestamp.toISOString(),
      resultado: tentativa.resultado ?? null,
      motivoInsucesso: tentativa.motivoInsucesso ?? null,
    })),
  });
}

/**
 * Controller (T024/#89): `GET /v1/orcamentos/{orcamentoId}/extracao/status`.
 * Recebe `ConsultarStatusExtracao` já construído — quem instancia o
 * repositório concreto (`DrizzleExtracaoOrcamentoRepository`, T013) é a
 * composição raiz do handler Lambda, fora deste arquivo. Mesmo padrão de
 * `status.controller.ts` (spec 001).
 */
export function registrarRotaStatusExtracao(
  app: FastifyInstance,
  consultarStatusExtracao: ConsultarStatusExtracao,
  opts: RotaOpts = {},
): void {
  app.get(
    '/v1/orcamentos/:orcamentoId/extracao/status',
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
        const extracao = await consultarStatusExtracao.executar(params.data.orcamentoId);
        await reply.status(200).send(paraResposta(extracao));
      } catch (erro) {
        if (
          erro instanceof ExtracaoNaoEncontradaError ||
          erro instanceof OrcamentoIdInvalidoError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/nao-encontrado',
            title: 'Extração não encontrada',
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
