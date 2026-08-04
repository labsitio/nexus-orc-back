import type { FastifyInstance } from 'fastify';
import type { ReceberOrcamento } from '../../application/use-cases/receber-orcamento.js';
import type { ArmazenamentoBrutoGateway } from '../../domain/gateways/armazenamento-bruto.gateway.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import type { RotaOpts } from './route-opts.js';
import type { ProblemDetails } from './status.schema.js';
import {
  confirmarUploadParamsSchema,
  confirmarUploadRequestSchema,
  confirmarUploadResponseSchema,
} from './confirmar-upload.schema.js';

// Node normaliza headers HTTP repetidos em uma única string separada por
// vírgula (RFC 7230) antes de chegar aqui — `string[]` só ocorre para
// `set-cookie`, nunca para `idempotency-key`; `Array.isArray` é defesa sem
// caminho real de teste via HTTP, mantida só para não quebrar o tipo.
function idempotencyKeyDoHeader(valor: string | string[] | undefined): string | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor;
}

/**
 * Controller (T022/#27): `POST /v1/orcamentos/{orcamentoId}/confirmar-upload`.
 * Ponto real de disparo de `ReceberOrcamento` (ADR-002) — localiza o objeto já
 * enviado via a URL presigned de `upload-url` (T021/#26, mesma chave
 * determinística) e só então cria/persiste o agregado e publica o evento.
 * 409 Problem Details se o upload nunca foi concluído (objeto não existe).
 * `tenantId` (T016, spec 007) vem exclusivamente de `request.tenantContext`
 * (populado pelo `TenantContextMiddleware` a partir do claim JWT já
 * validado) — nunca do body; 401 Problem Details se ausente.
 */
export function registrarRotaConfirmarUpload(
  app: FastifyInstance,
  armazenamento: ArmazenamentoBrutoGateway,
  receberOrcamento: ReceberOrcamento,
  opts: RotaOpts = {},
): void {
  app.post(
    '/v1/orcamentos/:orcamentoId/confirmar-upload',
    { preHandler: opts.preHandler },
    async (request, reply) => {
      const params = confirmarUploadParamsSchema.safeParse(request.params);
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

      const body = confirmarUploadRequestSchema.safeParse(request.body);
      if (!body.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title: 'corpo da requisição inválido',
          status: 400,
          detail: body.error.issues.map((i) => i.message).join('; '),
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

      const idempotencyKey = idempotencyKeyDoHeader(request.headers['idempotency-key']);

      const orcamentoId = OrcamentoId.de(params.data.orcamentoId);
      const referenciaBruta = await armazenamento.confirmarUpload(
        body.data.canal,
        orcamentoId,
        body.data.nomeArquivo,
      );
      if (!referenciaBruta) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/upload-nao-concluido',
          title: 'Upload ainda não concluído para este orcamentoId',
          status: 409,
        };
        await reply.status(409).type('application/problem+json').send(problema);
        return;
      }

      const idResultado = await receberOrcamento.executar({
        canal: body.data.canal,
        referenciaBruta,
        referenciaExterna: body.data.referenciaExterna,
        orcamentoId,
        idempotencyKey,
        tenantId: tenantContext.tenantId,
      });

      await reply
        .status(200)
        .send(confirmarUploadResponseSchema.parse({ orcamentoId: idResultado.toString() }));
    },
  );
}
