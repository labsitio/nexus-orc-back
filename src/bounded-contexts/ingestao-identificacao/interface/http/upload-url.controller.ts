import type { FastifyInstance } from 'fastify';
import type { ArmazenamentoBrutoGateway } from '../../domain/gateways/armazenamento-bruto.gateway.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import type { ProblemDetails } from './status.schema.js';
import { uploadUrlRequestSchema, uploadUrlResponseSchema } from './upload-url.schema.js';

/**
 * Controller (T021/#26): `POST /v1/orcamentos/upload-url`. Gera apenas a URL
 * presigned + `orcamentoId` provisório — não persiste nada (ADR-002: só
 * `confirmar-upload`, T022/#27, dispara `ReceberOrcamento` de fato).
 */
export function registrarRotaUploadUrl(
  app: FastifyInstance,
  armazenamento: ArmazenamentoBrutoGateway,
): void {
  app.post('/v1/orcamentos/upload-url', async (request, reply) => {
    const body = uploadUrlRequestSchema.safeParse(request.body);
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

    const orcamentoId = OrcamentoId.novo();
    const uploadUrl = await armazenamento.gerarUrlUpload(orcamentoId, body.data.nomeArquivo);

    await reply.status(201).send(
      uploadUrlResponseSchema.parse({
        orcamentoId: orcamentoId.toString(),
        uploadUrl,
      }),
    );
  });
}
