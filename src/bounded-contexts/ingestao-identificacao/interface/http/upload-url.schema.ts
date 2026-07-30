import { z } from 'zod';

/**
 * Contrato de borda (Zod) de `POST /v1/orcamentos/upload-url` (T021/#26,
 * ADR-002 — presigned URL de PUT direto ao S3, endpoint só gera a URL, não
 * persiste nada; a persistência real acontece em `confirmar-upload`, T022/#27).
 * `SFTP` não usa este fluxo (plan.md, ADR-002) — o arquivo já chega ao S3
 * via AWS Transfer Family, sem passar por upload-url.
 */
export const CANAIS_UPLOAD_URL = ['PORTAL_WEB', 'API_REST', 'APP_MOBILE'] as const;

export const uploadUrlRequestSchema = z.object({
  canal: z.enum(CANAIS_UPLOAD_URL),
  nomeArquivo: z.string().min(1),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  uploadUrl: z.string().url(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;
