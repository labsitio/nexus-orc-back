import { z } from 'zod';

/**
 * Contrato de borda (Zod) de `POST /v1/orcamentos/upload-url` (T021/#26,
 * ADR-002 — presigned URL de PUT direto ao S3, endpoint só gera a URL, não
 * persiste nada; a persistência real acontece em `confirmar-upload`, T022/#27).
 * `SFTP` não usa este fluxo (plan.md, ADR-002) — o arquivo já chega ao S3
 * via AWS Transfer Family, sem passar por upload-url.
 */
export const CANAIS_UPLOAD_URL = ['PORTAL_WEB', 'API_REST', 'APP_MOBILE'] as const;

const NOME_ARQUIVO_TAMANHO_MAXIMO = 255;

/** Caractere de controle ASCII (0x00–0x1F) ou DEL (0x7F). */
const CARACTERE_DE_CONTROLE = new RegExp(`[\\u0000-\\u001f\\u007f]`);

/**
 * `nomeArquivo` é entrada não confiável (ADR-013) e compõe a key S3
 * (`s3-armazenamento-bruto.gateway.ts`) e o prefixo usado pela lifecycle
 * rule de expiração de upload pendente — sanitizado uma única vez, aqui,
 * na origem. `/`, `\` e `..` escapam do prefixo esperado na key; caracteres
 * de controle não têm razão legítima em nome de arquivo. Acento, espaço,
 * parêntese, hífen e cedilha continuam permitidos — nome de fornecedor real
 * não é ASCII limpo.
 */
export const nomeArquivoSchema = z
  .string()
  .min(1)
  .max(
    NOME_ARQUIVO_TAMANHO_MAXIMO,
    `nomeArquivo excede o tamanho máximo de ${NOME_ARQUIVO_TAMANHO_MAXIMO} caracteres`,
  )
  .refine((valor) => !/[/\\]/.test(valor), 'nomeArquivo não pode conter separador de path ("/" ou "\\")')
  .refine((valor) => !valor.includes('..'), 'nomeArquivo não pode conter ".."')
  .refine((valor) => !CARACTERE_DE_CONTROLE.test(valor), 'nomeArquivo não pode conter caractere de controle');

export const uploadUrlRequestSchema = z.object({
  canal: z.enum(CANAIS_UPLOAD_URL),
  nomeArquivo: nomeArquivoSchema,
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z.object({
  orcamentoId: z.string().uuid(),
  uploadUrl: z.string().url(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;
