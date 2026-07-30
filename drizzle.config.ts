import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './drizzle/schema.ts',
  out: './drizzle',
  // `generate` não precisa de conexão real; `migrate`/`push` exigem DATABASE_URL
  // e falham com mensagem clara do próprio drizzle-kit se ausente.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
