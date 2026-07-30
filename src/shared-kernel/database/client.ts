import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL não configurada — conexão com Aurora Serverless v2 exige essa variável de ambiente.',
    );
  }
  return url;
}

// ponytail: Pool único por processo Lambda (reuso entre invocações warm); se o
// volume de conexões simultâneas virar problema, avaliar RDS Proxy (ADR futuro).
const pool = new Pool({ connectionString: requireDatabaseUrl() });

export const db = drizzle(pool);
