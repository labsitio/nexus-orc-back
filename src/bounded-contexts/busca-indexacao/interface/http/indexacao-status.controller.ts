import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../../../shared-kernel/tenant/tenant-context.js';
import {
  ConsultarStatusIndexacao,
  IndiceOrcamentoNaoEncontradoError,
} from '../../application/use-cases/consultar-status-indexacao.js';
import type { IndiceOrcamento } from '../../domain/aggregates/indice-orcamento.aggregate.js';
import type { IndiceOrcamentoRepository } from '../../domain/repositories/indice-orcamento.repository.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import type { RotaOpts } from './route-opts.js';
import {
  orcamentoIdParamSchema,
  statusIndexacaoResponseSchema,
} from './indexacao-status.schema.js';
import type { ProblemDetails, StatusIndexacaoResponse } from './indexacao-status.schema.js';

/** Traduz o agregado para o contrato de resposta (T031/#191). */
export function paraResposta(indice: IndiceOrcamento): StatusIndexacaoResponse {
  return statusIndexacaoResponseSchema.parse({
    orcamentoId: indice.orcamentoId.toString(),
    status: indice.estado,
    modeloEmbedding: indice.embedding?.modeloId ?? null,
    historico: indice.historico.map((tentativa) => ({
      resultado: tentativa.resultado,
      timestamp: tentativa.timestamp.toISOString(),
      modeloEmbedding: tentativa.modeloEmbedding ?? null,
      motivoFalha: tentativa.motivoFalha ?? null,
    })),
  });
}

/**
 * Controller (T031/#191): `GET /v1/orcamentos/{orcamentoId}/indexacao/status`.
 *
 * `criarRepositorio` constrói uma instância *nova* de
 * `IndiceOrcamentoRepository` por requisição, a partir do `TenantContext`
 * resolvido pelo `TenantContextMiddleware` (`opts.preHandler`, spec 007) —
 * nunca reaproveita uma instância entre requisições/tenants
 * (`DrizzleTenantScopedRepositoryBase`, ADR-005: RLS depende do
 * `SET LOCAL app.current_tenant_id` fixado nessa instância). Quem constrói o
 * repositório concreto (`DrizzlePgvectorIndiceOrcamentoRepository`, T016) é a
 * composição raiz do handler Lambda, fora deste arquivo.
 *
 * `request.tenantContext` ausente (middleware não aplicado) nunca chega ao
 * caso de uso — responde 401 antes disso, mesma disciplina de
 * `TenantContextMiddleware.responderNaoAutenticado`.
 */
export function registrarRotaStatusIndexacao(
  app: FastifyInstance,
  criarRepositorio: (tenantContext: TenantContext) => IndiceOrcamentoRepository,
  opts: RotaOpts = {},
): void {
  app.get(
    '/v1/orcamentos/:orcamentoId/indexacao/status',
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

      const tenantContext = request.tenantContext;
      if (!tenantContext) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/nao-autenticado',
          title: 'Contexto de tenant ausente — TenantContextMiddleware não aplicado',
          status: 401,
        };
        await reply.status(401).type('application/problem+json').send(problema);
        return;
      }

      try {
        const consultarStatusIndexacao = new ConsultarStatusIndexacao(
          criarRepositorio(tenantContext),
        );
        const indice = await consultarStatusIndexacao.executar(
          tenantContext.tenantId,
          params.data.orcamentoId,
        );
        await reply.status(200).send(paraResposta(indice));
      } catch (erro) {
        if (
          erro instanceof IndiceOrcamentoNaoEncontradoError ||
          erro instanceof OrcamentoIdInvalidoError
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
