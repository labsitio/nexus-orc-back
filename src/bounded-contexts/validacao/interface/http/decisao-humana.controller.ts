import type { FastifyInstance } from 'fastify';
import {
  ConsultarStatusValidacao,
  OrcamentoValidacaoNaoEncontradoError,
  TenantDivergenciaError,
} from '../../application/use-cases/consultar-status-validacao.js';
import { RegistrarDecisaoHumanaValidacao } from '../../application/use-cases/registrar-decisao-humana-validacao.js';
import { TransicaoInvalidaValidacaoError } from '../../domain/orcamento-validacao.aggregate.js';
import { DadosExtraidosParaValidacaoInvalidosError } from '../../domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidadeInvalidoError } from '../../domain/value-objects/periodo-validade.vo.js';
import { paraResposta } from './status.controller.js';
import { orcamentoIdParamSchema } from './status.schema.js';
import { decisaoHumanaValidacaoRequestSchema } from './decisao-humana.schema.js';
import type { ProblemDetails } from './status.schema.js';
import type { RotaOpts } from './route-opts.js';

/**
 * Controller (T036/#146): `POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana`.
 * Recebe `RegistrarDecisaoHumanaValidacao` (T035) e `ConsultarStatusValidacao`
 * (T026) já construídos — quem instancia repositório/publisher concretos é a
 * composição raiz do handler Lambda, fora deste arquivo (mesmo padrão de
 * `status.controller.ts` e `extracao/interface/http/revisao-humana.controller.ts`).
 *
 * Deliberadamente fino: só parseia (Zod) e delega — a tradução do body para
 * `DecisaoHumanaValidacao` (merge de `dadosCorrigidos` + reavaliação de
 * regras determinísticas) é responsabilidade de
 * `RegistrarDecisaoHumanaValidacao.construirDecisao` (Application), nunca
 * deste controller (Interface nunca contém regra de negócio).
 *
 * 409 Problem Details quando a validação não está em `PENDENTE_REVISAO_HUMANA`
 * (mapeado a partir de `TransicaoInvalidaValidacaoError`, T030); 404 quando o
 * orçamento não tem validação registrada; 400 para body/params inválidos,
 * incluindo `CORRECAO_APLICADA` sem `dadosCorrigidos` e `dadosCorrigidos` que
 * não reconstrói um `DadosExtraidosParaValidacao`/`PeriodoValidade` válido.
 */
export function registrarRotaDecisaoHumanaValidacao(
  app: FastifyInstance,
  registrarDecisaoHumanaValidacao: RegistrarDecisaoHumanaValidacao,
  consultarStatusValidacao: ConsultarStatusValidacao,
  opts: RotaOpts = {},
): void {
  app.post(
    '/v1/orcamentos/:orcamentoId/validacao/decisao-humana',
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

      const body = decisaoHumanaValidacaoRequestSchema.safeParse(request.body);
      if (!body.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title:
            'Body inválido — decisao deve ser CORRECAO_APLICADA ou ACEITE_COM_RESSALVA, com justificativa',
          status: 400,
          detail: body.error.issues.map((i) => i.message).join('; '),
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      if (body.data.decisao === 'CORRECAO_APLICADA' && !body.data.dadosCorrigidos) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title: 'dadosCorrigidos é obrigatório quando decisao é CORRECAO_APLICADA',
          status: 400,
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      try {
        // (issue #656) `request.tenantContext` é populado por
        // `TenantContextMiddleware` a partir do JWT Cognito. Nunca vem de
        // query/path/body — isso seria escalação de privilégio. Middleware
        // retorna 401 se ausente/inválido antes de chegar aqui.
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

        const validacaoAtual = await consultarStatusValidacao.executar(
          params.data.orcamentoId,
          tenantId,
        );
        const decisao = registrarDecisaoHumanaValidacao.construirDecisao(validacaoAtual, body.data);

        await registrarDecisaoHumanaValidacao.executar(params.data.orcamentoId, tenantId, decisao);

        const validacaoAtualizada = await consultarStatusValidacao.executar(
          params.data.orcamentoId,
          tenantId,
        );
        await reply.status(200).send(paraResposta(validacaoAtualizada));
      } catch (erro) {
        if (
          erro instanceof OrcamentoValidacaoNaoEncontradoError ||
          erro instanceof OrcamentoIdInvalidoError ||
          erro instanceof TenantDivergenciaError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/nao-encontrado',
            title: 'Validação não encontrada',
            status: 404,
          };
          await reply.status(404).type('application/problem+json').send(problema);
          return;
        }
        if (erro instanceof TransicaoInvalidaValidacaoError) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/transicao-invalida',
            title: 'Ação não permitida para o estado atual do agregado',
            status: 409,
            detail: erro.message,
          };
          await reply.status(409).type('application/problem+json').send(problema);
          return;
        }
        if (
          erro instanceof DadosExtraidosParaValidacaoInvalidosError ||
          erro instanceof PeriodoValidadeInvalidoError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/validacao',
            title: 'dadosCorrigidos inválido',
            status: 400,
            detail: erro.message,
          };
          await reply.status(400).type('application/problem+json').send(problema);
          return;
        }
        throw erro;
      }
    },
  );
}
