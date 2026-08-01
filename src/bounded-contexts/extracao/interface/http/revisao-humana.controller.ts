import type { FastifyInstance } from 'fastify';
import type { ExtracaoOrcamento } from '../../domain/extracao-orcamento.aggregate.js';
import { TransicaoInvalidaExtracaoError } from '../../domain/extracao-orcamento.aggregate.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import {
  CaminhoConfirmacaoInvalidoError,
  ConfirmarRevisaoHumanaExtracao,
  ExtracaoNaoEncontradaError,
} from '../../application/use-cases/confirmar-revisao-humana-extracao.js';
import type { ProblemDetails, StatusExtracaoResponse } from './status.schema.js';
import { orcamentoIdParamSchema, statusExtracaoResponseSchema } from './status.schema.js';
import { revisaoHumanaExtracaoBodySchema } from './revisao-humana.schema.js';
import type { RotaOpts } from './route-opts.js';

/**
 * `StatusExtracaoResponse` mínima construída a partir do agregado após a
 * confirmação — deliberadamente não reaproveita `paraResposta` de
 * `status.controller.ts` (T024, em implementação paralela por outro agente
 * neste momento): evita depender de um arquivo que ainda não existe nesta
 * branch e reduz colisão de merge. Duplicação pontual, aceita — se `T024`
 * mergear primeiro, promover para função compartilhada fica registrado como
 * débito (ponytail). Validada contra `statusExtracaoResponseSchema` antes do
 * envio — mesma rede de segurança runtime contra drift de contrato usada em
 * `ingestao-identificacao/interface/http/status.controller.ts`.
 */
function paraResposta(extracao: ExtracaoOrcamento): StatusExtracaoResponse {
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
 * Controller (T039/#104): `POST /v1/orcamentos/{orcamentoId}/extracao/revisao-humana`.
 * Recebe `ConfirmarRevisaoHumanaExtracao` (T038/#103) já construído — quem
 * instancia repositório/publisher concretos é a composição raiz do handler
 * Lambda, fora deste arquivo (mesmo padrão do BC `ingestao-identificacao`,
 * `revisao-humana.controller.ts`).
 *
 * 409 Problem Details quando a extração não está em `PENDENTE_REVISAO_HUMANA`
 * (spec.md), mapeado a partir de `TransicaoInvalidaExtracaoError`; 400 para
 * `caminho` inválido (`CaminhoConfirmacaoInvalidoError`); 404 quando a
 * extração não existe para o `orcamentoId`.
 */
export function registrarRotaRevisaoHumanaExtracao(
  app: FastifyInstance,
  confirmarRevisaoHumanaExtracao: ConfirmarRevisaoHumanaExtracao,
  opts: RotaOpts = {},
): void {
  app.post(
    '/v1/orcamentos/:orcamentoId/extracao/revisao-humana',
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

      const body = revisaoHumanaExtracaoBodySchema.safeParse(request.body);
      if (!body.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title:
            'Body inválido — camposConfirmados exige 1+ item, cada um com valor real ou indisponivel: true',
          status: 400,
          detail: body.error.issues.map((i) => i.message).join('; '),
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      try {
        const extracao = await confirmarRevisaoHumanaExtracao.executar({
          orcamentoId: params.data.orcamentoId,
          camposConfirmados: body.data.camposConfirmados,
        });
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
        if (erro instanceof CaminhoConfirmacaoInvalidoError) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/validacao',
            title: 'Caminho de confirmação inválido',
            status: 400,
            detail: erro.message,
          };
          await reply.status(400).type('application/problem+json').send(problema);
          return;
        }
        if (erro instanceof TransicaoInvalidaExtracaoError) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/transicao-invalida',
            title: 'Extração não está pendente de revisão humana',
            status: 409,
            detail: erro.message,
          };
          await reply.status(409).type('application/problem+json').send(problema);
          return;
        }
        throw erro;
      }
    },
  );
}
