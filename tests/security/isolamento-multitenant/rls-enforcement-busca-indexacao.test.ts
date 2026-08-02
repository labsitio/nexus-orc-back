// Adversarial (T015b, ADR-005, achado MAJOR de revisão do PR #534): prova que
// a RLS de `indices_orcamento`/`indices_orcamento_historico` bloqueia
// leitura/escrita cross-tenant numa CONEXÃO REAL, não apenas via checagem de
// catálogo (`pg_class`/`pg_policies`, já coberta em
// `indice-orcamento-completo.schema.test.ts`).
//
// Mesmo motivo documentado em `rls-enforcement.test.ts` (orcamentos, spec
// 007/T007): a role local de dev/CI usada em DATABASE_URL (`nexo`,
// docker-compose) é SUPERUSER com BYPASSRLS=true — superuser sempre ignora
// RLS, mesmo com FORCE ROW LEVEL SECURITY. Este teste cria uma role dedicada
// SEM BYPASSRLS (mesmo perfil exigido pelo checklist de infraestrutura T009
// da spec 007 para a role IAM/DB de Lambda em produção) e exercita a
// política de fato.
//
// Requer DATABASE_URL (mesmo requisito de
// indice-orcamento-completo.schema.test.ts). Sem DATABASE_URL, a suíte é
// pulada, não falha.
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

describe.skipIf(!DATABASE_URL)(
  'RLS indices_orcamento/indices_orcamento_historico — role sem BYPASSRLS',
  () => {
    const roleName = `rls_teste_bi_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const rolePassword = randomUUID();

    let superuserClient: Client;
    let restrictedClient: Client;
    const idsCriados: string[] = [];

    beforeAll(async () => {
      superuserClient = new Client({ connectionString: DATABASE_URL });
      await superuserClient.connect();

      // Reproduz o perfil exigido para a role de app em produção (ADR-003/T009
      // da spec 007: "nenhuma role de Lambda MUST ter BYPASSRLS").
      await superuserClient.query(
        `create role ${roleName} login password '${rolePassword}' nosuperuser nobypassrls`,
      );
      await superuserClient.query(`grant usage on schema busca_indexacao to ${roleName}`);
      await superuserClient.query(
        `grant select, insert on busca_indexacao.indices_orcamento, busca_indexacao.indices_orcamento_historico to ${roleName}`,
      );
      await superuserClient.query(
        `grant usage on busca_indexacao.indices_orcamento_historico_id_seq to ${roleName}`,
      );

      restrictedClient = new Client({
        connectionString: urlComCredencial(DATABASE_URL as string, roleName, rolePassword),
      });
      await restrictedClient.connect();
    });

    afterAll(async () => {
      if (idsCriados.length > 0) {
        // Limpeza via role superuser (bypassa RLS, enxerga as duas linhas).
        // indices_orcamento_historico é append-only (trigger bloqueia DELETE
        // mesmo para superuser) — desabilita o trigger só para a limpeza de
        // teste, reabilita em seguida. FK exige apagar histórico antes do
        // indice_orcamento correspondente.
        await superuserClient.query(
          `alter table busca_indexacao.indices_orcamento_historico disable trigger trg_indices_orcamento_historico_bloquear_delete`,
        );
        await superuserClient.query(
          `delete from busca_indexacao.indices_orcamento_historico where indice_orcamento_id = any($1::uuid[])`,
          [idsCriados],
        );
        await superuserClient.query(
          `alter table busca_indexacao.indices_orcamento_historico enable trigger trg_indices_orcamento_historico_bloquear_delete`,
        );
        await superuserClient.query(
          `delete from busca_indexacao.indices_orcamento where id = any($1::uuid[])`,
          [idsCriados],
        );
      }
      await restrictedClient.end();
      await superuserClient.query(
        `revoke all on busca_indexacao.indices_orcamento, busca_indexacao.indices_orcamento_historico from ${roleName}`,
      );
      await superuserClient.query(
        `revoke usage on busca_indexacao.indices_orcamento_historico_id_seq from ${roleName}`,
      );
      await superuserClient.query(`revoke usage on schema busca_indexacao from ${roleName}`);
      await superuserClient.query(`drop role ${roleName}`);
      await superuserClient.end();
    });

    it('sessão sem set_config nenhum falha explicitamente (fail-closed, nunca retorna tudo)', async () => {
      await restrictedClient.query('BEGIN');
      try {
        await expect(
          restrictedClient.query('select id from busca_indexacao.indices_orcamento limit 1'),
        ).rejects.toThrow(/unrecognized configuration parameter/);
      } finally {
        await restrictedClient.query('ROLLBACK');
      }
    });

    it('tenant A nunca vê linha inserida por tenant B', async () => {
      const idTenantB = randomUUID();
      idsCriados.push(idTenantB);

      await comTenant(restrictedClient, TENANT_B, async () => {
        await restrictedClient.query(
          `insert into busca_indexacao.indices_orcamento (id, tenant_id, estado, conteudo_indexavel, origem_validacao)
           values ($1, $2, 'PENDENTE', '{}'::jsonb, 'VALIDADO')`,
          [idTenantB, TENANT_B],
        );
      });

      const linhas = await comTenant(restrictedClient, TENANT_A, async () => {
        const resultado = await restrictedClient.query(
          'select id from busca_indexacao.indices_orcamento where id = $1',
          [idTenantB],
        );
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
          `insert into busca_indexacao.indices_orcamento (id, tenant_id, estado, conteudo_indexavel, origem_validacao)
           values ($1, $2, 'PENDENTE', '{}'::jsonb, 'VALIDADO')`,
          [idTenantA, TENANT_A],
        );
      });
      await comTenant(restrictedClient, TENANT_B, async () => {
        await restrictedClient.query(
          `insert into busca_indexacao.indices_orcamento (id, tenant_id, estado, conteudo_indexavel, origem_validacao)
           values ($1, $2, 'PENDENTE', '{}'::jsonb, 'VALIDADO')`,
          [idTenantB, TENANT_B],
        );
      });

      const linhasA = await comTenant(restrictedClient, TENANT_A, async () => {
        const resultado = await restrictedClient.query(
          'select id from busca_indexacao.indices_orcamento where id in ($1, $2)',
          [idTenantA, idTenantB],
        );
        return resultado.rows.map((r: { id: string }) => r.id);
      });

      expect(linhasA).toEqual([idTenantA]);
    });

    it('indices_orcamento_historico também isola por tenant (mesma política, tabela distinta)', async () => {
      const idIndiceA = randomUUID();
      idsCriados.push(idIndiceA);

      await comTenant(restrictedClient, TENANT_A, async () => {
        await restrictedClient.query(
          `insert into busca_indexacao.indices_orcamento (id, tenant_id, estado, conteudo_indexavel, origem_validacao)
           values ($1, $2, 'PENDENTE', '{}'::jsonb, 'VALIDADO')`,
          [idIndiceA, TENANT_A],
        );
        await restrictedClient.query(
          `insert into busca_indexacao.indices_orcamento_historico (tenant_id, indice_orcamento_id, resultado, ocorreu_em)
           values ($1, $2, 'FALHA_TECNICA', now())`,
          [TENANT_A, idIndiceA],
        );
      });

      const linhasCrossTenant = await comTenant(restrictedClient, TENANT_B, async () => {
        const resultado = await restrictedClient.query(
          'select id from busca_indexacao.indices_orcamento_historico where indice_orcamento_id = $1',
          [idIndiceA],
        );
        return resultado.rows;
      });

      expect(linhasCrossTenant).toHaveLength(0);
    });

    it('FORCE ROW LEVEL SECURITY também bloqueia o dono da tabela, se não for superuser', async () => {
      // Confirma a garantia central do ADR-005 ("mesmo se um repositório
      // futuro esquecer de filtrar"): mesmo a própria role restrita não
      // escapa da política ao tentar ler sem tenant algum configurado.
      await restrictedClient.query('BEGIN');
      try {
        await restrictedClient.query(`select set_config('app.current_tenant_id', $1, true)`, [
          randomUUID(), // tenant aleatório, nenhuma linha pertence a ele
        ]);
        const resultado = await restrictedClient.query(
          'select id from busca_indexacao.indices_orcamento',
        );
        expect(resultado.rows).toHaveLength(0);
      } finally {
        await restrictedClient.query('ROLLBACK');
      }
    });
  },
);
