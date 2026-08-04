import type { FastifyInstance } from 'fastify';
import { TransicaoInvalidaError } from '../../domain/orcamento.aggregate.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import {
  ConfirmarRevisaoHumana,
  OrcamentoNaoEncontradoParaRevisaoHumanaError,
  TenantDivergenciaError,
} from '../../application/use-cases/confirmar-revisao-humana.js';
import type { ProblemDetails } from './status.schema.js';
import type { RotaOpts } from './route-opts.js';
import { orcamentoIdParamSchema } from './status.schema.js';
import { paraResposta } from './status.controller.js';
import { revisaoHumanaBodySchema } from './revisao-humana.schema.js';

/**
 * Controller (T053/#58): `POST /v1/orcamentos/{orcamentoId}/revisao-humana`.
 * Recebe `ConfirmarRevisaoHumana` (T052/#57) já construído — quem instancia
 * o repositório/publisher concretos é a composição raiz do handler Lambda,
 * fora deste arquivo (mesmo padrão de `status.controller.ts`, T047/#52).
 *
 * 409 Problem Details quando o orçamento não está em `PENDENTE_REVISAO_HUMANA`
 * (spec.md) — mapeado a partir de `TransicaoInvalidaError`, lançado pelo
 * próprio agregado via `registrarConfirmacaoHumana` (T007/#12).
 */
export function registrarRotaRevisaoHumana(
  app: FastifyInstance,
  confirmarRevisaoHumana: ConfirmarRevisaoHumana,
  opts: RotaOpts = {},
): void {
  app.post('/v1/orcamentos/:orcamentoId/revisao-humana', { preHandler: opts.preHandler }, async (request, reply) => {
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

    const body = revisaoHumanaBodySchema.safeParse(request.body);
    if (!body.success) {
      const problema: ProblemDetails = {
        type: 'https://nexo.internal/problems/validacao',
        title: 'Body inválido — fornecedorIdentificado e formatoIdentificado são obrigatórios',
        status: 400,
        detail: body.error.issues.map((i) => i.message).join('; '),
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

      const orcamento = await confirmarRevisaoHumana.executar({
        orcamentoId: params.data.orcamentoId,
        fornecedorIdentificado: body.data.fornecedorIdentificado,
        formatoIdentificado: body.data.formatoIdentificado,
        tenantId,
      });
      await reply.status(200).send(paraResposta(orcamento));
    } catch (erro) {
      if (
        erro instanceof OrcamentoNaoEncontradoParaRevisaoHumanaError ||
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
      if (erro instanceof TransicaoInvalidaError) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/transicao-invalida',
          title: 'Orçamento não está pendente de revisão humana',
          status: 409,
          detail: erro.message,
        };
        await reply.status(409).type('application/problem+json').send(problema);
        return;
      }
      throw erro;
    }
  });
}
