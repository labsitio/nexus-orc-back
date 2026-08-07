import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { criarExigenciaPapel } from '../../../../interface/shared/role-guard.middleware.js';
import {
  ConsultarStatusDecisaoWorkflow,
  DecisaoWorkflowNaoEncontradaError,
  TenantDivergenciaError,
} from '../../application/use-cases/consultar-status-decisao-workflow.js';
import { RegistrarDecisaoHumanaWorkflow } from '../../application/use-cases/registrar-decisao-humana-workflow.js';
import {
  JustificativaHumanaAusenteError,
  TransicaoInvalidaDecisaoWorkflowError,
} from '../../domain/aggregates/decisao-workflow.aggregate.js';
import {
  AprovacaoSemValidacaoError,
  CriterioAusenteError,
  ReenvioSemFundamentoError,
} from '../../domain/value-objects/decisao-roteamento.vo.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import type { RotaOpts } from './route-opts.js';
import { decisaoHumanaWorkflowRequestSchema } from './decisao-humana.schema.js';
import { orcamentoIdParamSchema } from './status.schema.js';
import type { ProblemDetails } from './status.schema.js';
import { paraResposta } from './status.controller.js';

/** Único papel autorizado a decidir sobre um orçamento escalonado (ADR-010, spec.md/plan.md). */
const PAPEL_COMPRADOR_RESPONSAVEL = 'comprador-responsavel';

function paraArray(preHandler: RotaOpts['preHandler']): preHandlerHookHandler[] {
  if (!preHandler) {
    return [];
  }
  return Array.isArray(preHandler) ? preHandler : [preHandler];
}

/**
 * Controller (T044/#250): `POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana`.
 * Só avança um orçamento escalonado (`PENDENTE_REVISAO_HUMANA`) mediante decisão
 * humana explícita — a transição e as invariantes de negócio são do agregado
 * (`DecisaoWorkflow.registrarDecisaoHumana`, via `RegistrarDecisaoHumanaWorkflow`);
 * este controller apenas traduz request↔Application e mapeia erro de domínio para
 * Problem Details (RFC 7807), mesmo padrão de `status.controller.ts`.
 *
 * ADR-010 (`docs/architecture-diagrams/adr-010-verificacao-papel-autorizacao.html`):
 * papel "comprador responsável" é exigido incondicionalmente — `criarExigenciaPapel`
 * é sempre concatenado ao FINAL do array de `preHandler`, depois de qualquer
 * autenticação/tenant-context injetada pelo chamador (composição raiz ou teste).
 * Não há caminho para registrar esta rota sem o guard (issue #688 absorvida: T044
 * já nasce protegida, nunca desprotegida "para aplicar depois").
 *
 * `requerIntegracaoExterna` é sempre `false` aqui: o contrato aprovado
 * (`docs/openapi.yaml`, schema `DecisaoHumanaWorkflowRequest`) não inclui esse campo
 * no corpo — ADR-003 reserva o flag ao agente decisor automático, não ao comprador.
 *
 * Resposta 200 é montada via `ConsultarStatusDecisaoWorkflow` (query já existente,
 * T030) após a escrita ter sucesso — mesmo contrato de `GET .../workflow/status`
 * (`docs/openapi.yaml`, `StatusWorkflowResponse`), sem duplicar tradução.
 */
export function registrarRotaDecisaoHumanaWorkflow(
  app: FastifyInstance,
  registrarDecisaoHumanaWorkflow: RegistrarDecisaoHumanaWorkflow,
  consultarStatusDecisaoWorkflow: ConsultarStatusDecisaoWorkflow,
  opts: RotaOpts = {},
): void {
  app.post(
    '/v1/orcamentos/:orcamentoId/workflow/decisao-humana',
    {
      preHandler: [
        ...paraArray(opts.preHandler),
        criarExigenciaPapel([PAPEL_COMPRADOR_RESPONSAVEL]),
      ],
    },
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

      const body = decisaoHumanaWorkflowRequestSchema.safeParse(request.body);
      if (!body.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title: 'Corpo da requisição inválido',
          status: 400,
          detail: body.error.issues.map((i) => i.message).join('; '),
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      // `request.tenantContext` é populado por `TenantContextMiddleware` a partir
      // do JWT Cognito verificado. Nunca vem de query/path/body — seria escalação
      // de privilégio. Ausente aqui só ocorre se a rota for composta sem esse
      // middleware (defeito de composição, não de requisição) — fallback defensivo.
      const tenantId = request.tenantContext?.tenantId;
      if (!tenantId) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/nao-autenticado',
          title: 'Contexto de tenant ausente',
          status: 401,
        };
        await reply.status(401).type('application/problem+json').send(problema);
        return;
      }

      try {
        await registrarDecisaoHumanaWorkflow.executar(params.data.orcamentoId, tenantId, {
          acao: body.data.acao,
          criterio: body.data.justificativa,
          requerIntegracaoExterna: false,
          motivoDadoAusente: body.data.motivoDadoAusente,
        });

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

        // `CriterioAusenteError` e `AprovacaoSemValidacaoError` são estruturalmente
        // inalcançáveis por este controller hoje: o primeiro só dispara quando
        // `agenteOrigem !== 'HUMANO'` (sempre 'HUMANO' aqui); o segundo exige
        // `contextoValidacao` ausente/reprovado, mas `ContextoValidacao` só é
        // instanciável com `VALIDADO`/`VALIDADO_COM_RESSALVA` (sempre aprovável) e
        // `consolidarContexto` exige o contexto presente para chegar a
        // `PENDENTE_REVISAO_HUMANA`. Mantidos no mapeamento por defesa em
        // profundidade — se essas invariantes do agregado mudarem no futuro, o erro
        // já cai em 409 em vez de 500 silencioso.
        if (
          erro instanceof TransicaoInvalidaDecisaoWorkflowError ||
          erro instanceof AprovacaoSemValidacaoError ||
          erro instanceof ReenvioSemFundamentoError ||
          erro instanceof CriterioAusenteError ||
          erro instanceof JustificativaHumanaAusenteError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/conflito-estado',
            title: erro.message,
            status: 409,
          };
          await reply.status(409).type('application/problem+json').send(problema);
          return;
        }

        throw erro;
      }
    },
  );
}
