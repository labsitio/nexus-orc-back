import { z } from 'zod';
import { CANAIS_UPLOAD_URL } from './upload-url.schema.js';

/**
 * Contrato de borda (Zod) de `POST /v1/orcamentos/{orcamentoId}/confirmar-upload`
 * (T022/#27, ADR-002) — dispara `ReceberOrcamento` de fato. `canal`/`nomeArquivo`
 * repetem o que foi enviado a `upload-url` (T021/#26), pois este endpoint é
 * uma chamada HTTP separada e sem estado entre as duas.
 */
export const confirmarUploadParamsSchema = z.object({
  orcamentoId: z.string().uuid(),
});

export const confirmarUploadRequestSchema = z.object({
  canal: z.enum(CANAIS_UPLOAD_URL),
  nomeArquivo: z.string().min(1),
  referenciaExterna: z.string().optional(),
});
export type ConfirmarUploadRequest = z.infer<typeof confirmarUploadRequestSchema>;

export const confirmarUploadResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
});
export type ConfirmarUploadResponse = z.infer<typeof confirmarUploadResponseSchema>;
