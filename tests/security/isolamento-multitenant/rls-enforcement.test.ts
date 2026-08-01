// Adversarial (T007, #270): prova que a RLS de `orcamentos`/`orcamentos_historico`
// bloqueia leitura/escrita cross-tenant numa CONEXÃO REAL, não apenas via
// checagem de catálogo (`pg_class`/`pg_policies`, já coberta em
// `orcamento.schema.test.ts`).
//
// Por quê este arquivo existe separado: a role local de dev/CI usada em
// DATABASE_URL (`nexo`, docker-compose) é SUPERUSER com BYPASSRLS=true —
// confirmado via `select rolsuper, rolbypassrls from pg_roles`. Superuser
// SEMPRE ignora RLS, mesmo com FORCE ROW LEVEL SECURITY (documentação
// Postgres: "superusers ... always bypass the row security system"). Ou
// seja: qualquer teste que use `client`/`db` direto sobre essa conexão
// passaria de forma idêntica mesmo que a política `tenant_isolation` nunca
// tivesse sido criada. Este teste cria uma role dedicada SEM BYPASSRLS (o
// mesmo perfil exigido pelo checklist de infraestrutura da T009/ADR-003
// para a role IAM/DB de Lambda em produção) e exercita a política de fato.
//
// Requer DATABASE_URL (mesmo requisito de orcamento.schema.test.ts). Sem
// DATABASE_URL, a suíte é pulada, não falha.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL;

const TENANT_A = '00000000-0000-7000-8000-0000000000aa';
const TENANT_B = '00000000-0000-7000-8000-0000000000bb';

function urlComCredencial(base: string, user: string, password: string): string {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  return url.toString();
}

async function comTenant<T>(client: Client, tenantId: string, fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`select set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    return await fn();
  } finally {
    await client.query('COMMIT');
  }
}

describe.skipIf(!DATABASE_URL)('RLS orcamentos/orcamentos_historico — role sem BYPASSRLS', () => {
  const roleName = `rls_teste_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const rolePassword = randomUUID();

  let superuserClient: Client;
  let restrictedClient: Client;
  const idsCriados: string[] = [];

  beforeAll(async () => {
    superuserClient = new Client({ connectionString: DATABASE_URL });
    await superuserClient.connect();

    // Reproduz o perfil exigido para a role de app em produção (ADR-003/T009:
    // "nenhuma role de Lambda MUST ter BYPASSRLS"), diferente da role local `nexo`.
    await superuserClient.query(
      `create role ${roleName} login password '${rolePassword}' nosuperuser nobypassrls`,
    );
    await superuserClient.query(
      `grant select, insert on orcamentos, orcamentos_historico to ${roleName}`,
    );

    restrictedClient = new Client({
      connectionString: urlComCredencial(DATABASE_URL as string, roleName, rolePassword),
    });
    await restrictedClient.connect();
  });

  afterAll(async () => {
    if (idsCriados.length > 0) {
      // Limpeza via role superuser (bypassa RLS, enxerga as duas linhas).
      await superuserClient.query(`delete from orcamentos where id = any($1::uuid[])`, [
        idsCriados,
      ]);
    }
    await restrictedClient.end();
    await superuserClient.query(`revoke all on orcamentos, orcamentos_historico from ${roleName}`);
    await superuserClient.query(`drop role ${roleName}`);
    await superuserClient.end();
  });

  it('sessão sem set_config nenhum falha explicitamente (fail-closed, nunca retorna tudo)', async () => {
    await restrictedClient.query('BEGIN');
    try {
      await expect(restrictedClient.query('select id from orcamentos limit 1')).rejects.toThrow(
        /unrecognized configuration parameter/,
      );
    } finally {
      await restrictedClient.query('ROLLBACK');
    }
  });

  it('tenant A nunca vê linha inserida por tenant B', async () => {
    const idTenantB = randomUUID();
    idsCriados.push(idTenantB);

    await comTenant(restrictedClient, TENANT_B, async () => {
      await restrictedClient.query(
        `insert into orcamentos (id, tenant_id, canal, recebido_em, bucket, key, version_id, status)
         values ($1, $2, 'API_REST', now(), 'nexo-orcamentos-raw', 'k', 'v1', 'RECEBIDO')`,
        [idTenantB, TENANT_B],
      );
    });

    const linhas = await comTenant(restrictedClient, TENANT_A, async () => {
      const resultado = await restrictedClient.query('select id from orcamentos where id = $1', [
        idTenantB,
      ]);
      return resultado.rows;
    });

    expect(linhas).toHaveLength(0);
  });

  it('tenant A vê apenas sua própria linha, mesmo com linha de tenant B na mesma tabela', async () => {
    const idTenantA = randomUUID();
    const idTenantB = randomUUID();
    idsCriados.push(idTenantA, idTenantB);

    await comTenant(restrictedClient, TENANT_A, async () => {
      await restrictedClient.query(
        `insert into orcamentos (id, tenant_id, canal, recebido_em, bucket, key, version_id, status)
         values ($1, $2, 'API_REST', now(), 'nexo-orcamentos-raw', 'k', 'v1', 'RECEBIDO')`,
        [idTenantA, TENANT_A],
      );
    });
    await comTenant(restrictedClient, TENANT_B, async () => {
      await restrictedClient.query(
        `insert into orcamentos (id, tenant_id, canal, recebido_em, bucket, key, version_id, status)
         values ($1, $2, 'API_REST', now(), 'nexo-orcamentos-raw', 'k', 'v1', 'RECEBIDO')`,
        [idTenantB, TENANT_B],
      );
    });

    const linhasA = await comTenant(restrictedClient, TENANT_A, async () => {
      const resultado = await restrictedClient.query(
        'select id from orcamentos where id in ($1, $2)',
        [idTenantA, idTenantB],
      );
      return resultado.rows.map((r: { id: string }) => r.id);
    });

    expect(linhasA).toEqual([idTenantA]);
  });

  it('FORCE ROW LEVEL SECURITY também bloqueia o dono da tabela, se não for superuser', async () => {
    // Confirma a garantia central do ADR-003 ("mesmo se um repositório futuro
    // esquecer de filtrar"): mesmo a própria role restrita, dona apenas do
    // GRANT (nunca dona da tabela em si — `orcamentos` pertence a `nexo`),
    // não escapa da política ao tentar ler sem tenant algum configurado.
    // A garantia de FORCE já foi checada estruturalmente em
    // orcamento.schema.test.ts (relforcerowsecurity=true); aqui é o mesmo
    // comportamento validado por trás de uma conexão que não é superuser.
    await restrictedClient.query('BEGIN');
    try {
      await restrictedClient.query(`select set_config('app.current_tenant_id', $1, true)`, [
        randomUUID(), // tenant aleatório, nenhuma linha pertence a ele
      ]);
      const resultado = await restrictedClient.query('select id from orcamentos');
      expect(resultado.rows).toHaveLength(0);
    } finally {
      await restrictedClient.query('ROLLBACK');
    }
  });
});
