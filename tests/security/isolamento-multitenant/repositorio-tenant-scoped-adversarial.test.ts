// Suíte adversarial (T010, #273) do checkpoint da Phase 2 (Foundational) —
// specs/007-isolamento-multitenant-dados/tasks.md. Cobre os 3 vetores de
// vazamento cross-tenant exigidos pelo checkpoint, através do caminho de
// produção real (`DrizzleTenantScopedRepositoryBase`), não apenas SQL cru:
//
// (a) repositório "trocado" — instância escopada para Tenant B tentando
//     alcançar uma linha de Tenant A: a RLS bloqueia independentemente do
//     filtro que o código da Application aplique (ou deixe de aplicar) na
//     query. Este é o caso adversarial central desta spec: mesmo um bug em
//     Application que esqueça `WHERE tenant_id = ...` não vaza dado, porque
//     a política `tenant_isolation` (T007) é a última linha de defesa.
// (b) sessão sem `set_config`/`SET LOCAL` — simulada aqui via um método de
//     repositório que (por bug) ignora `transacaoTenantScoped` (T008) e
//     chama `db.transaction` diretamente: MUST falhar explicitamente
//     (fail-closed), nunca retornar todas as linhas.
// (c) `tenantId` forjado via query/path/body na Interface — já coberto em
//     `tests/interface/shared/tenant-context.middleware.test.ts` (T005,
//     "ignora tenantId vindo de query param"): o middleware nunca repassa
//     esse valor ao `TenantContext`, então não há caminho para ele chegar
//     até aqui. Não duplicado nesta suíte para evitar teste redundante.
//
// Diferença deliberada em relação a `rls-enforcement.test.ts` (T007): aquele
// arquivo prova que a política RLS em si funciona via SQL cru + `set_config`
// manual. Este arquivo prova que o *código de produção* que os repositórios
// concretos (T014/T018, US1) vão estender — `DrizzleTenantScopedRepositoryBase`
// — preserva essa garantia de ponta a ponta, e que um desvio do padrão
// (esquecer de chamar `transacaoTenantScoped`) ainda falha fechado.
//
// Requer DATABASE_URL (mesmo requisito das demais suítes desta pasta). Sem
// DATABASE_URL, a suíte é pulada, não falha.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleTenantScopedRepositoryBase } from '../../../src/shared-kernel/tenant/drizzle-tenant-scoped-repository-base.js';
import {
  criarTenantContext,
  type TenantContext,
} from '../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../src/shared-kernel/tenant/tenant-id.vo.js';

const DATABASE_URL = process.env.DATABASE_URL;

const TENANT_A = TenantId.de('00000000-0000-7000-8000-0000000000aa');
const TENANT_B = TenantId.de('00000000-0000-7000-8000-0000000000bb');

function urlComCredencial(base: string, user: string, password: string): string {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  return url.toString();
}

/**
 * Repositório mínimo de teste — exercita `transacaoTenantScoped` (caminho
 * correto, T008) e expõe também um método que o ignora de propósito, para
 * provar o vetor (b) do checkpoint.
 */
class RepositorioOrcamentosDeTeste extends DrizzleTenantScopedRepositoryBase {
  constructor(db: NodePgDatabase, tenantContext: TenantContext) {
    super(db, tenantContext);
  }

  /** Caminho correto: `SET LOCAL app.current_tenant_id` sempre antes da query. */
  async buscarIdPorId(id: string): Promise<string[]> {
    return this.transacaoTenantScoped(async (tx) => {
      const resultado = await tx.execute(sql`select id from orcamentos where id = ${id}`);
      return resultado.rows.map((linha) => (linha as { id: string }).id);
    });
  }

  /** Wrapper público para os testes inserirem fixtures pelo caminho correto (T008). */
  async inserirDeTeste(campos: {
    id: string;
    tenantId: string;
    bucket: string;
    key: string;
    versionId: string;
  }): Promise<void> {
    await this.transacaoTenantScoped(async (tx) => {
      await tx.execute(
        sql`insert into orcamentos (id, tenant_id, canal, recebido_em, bucket, key, version_id, status)
            values (${campos.id}, ${campos.tenantId}, 'API_REST', now(), ${campos.bucket}, ${campos.key}, ${campos.versionId}, 'RECEBIDO')`,
      );
    });
  }

  /**
   * Caminho incorreto, deliberado — simula um desenvolvedor que criou um
   * método de repositório sem estender `transacaoTenantScoped` (bug real
   * possível em código futuro). Acessa `db` protegido via cast porque a
   * classe base não expõe `db` a subclasses (encapsulamento intencional);
   * aqui recriamos o cenário de bug via transação crua no mesmo `db`.
   */
  async buscarIdPorIdSemEscopo(db: NodePgDatabase, id: string): Promise<string[]> {
    return db.transaction(async (tx) => {
      const resultado = await tx.execute(sql`select id from orcamentos where id = ${id}`);
      return resultado.rows.map((linha) => (linha as { id: string }).id);
    });
  }
}

describe.skipIf(!DATABASE_URL)(
  'DrizzleTenantScopedRepositoryBase — adversarial cross-tenant (T010)',
  () => {
    const roleName = `rls_repo_teste_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const rolePassword = randomUUID();

    let superuserClient: Client;
    let pool: Pool;
    let dbRestrito: NodePgDatabase;
    const idsCriados: string[] = [];

    beforeAll(async () => {
      superuserClient = new Client({ connectionString: DATABASE_URL });
      await superuserClient.connect();

      // Mesmo perfil exigido pelo checklist de infraestrutura (T009): role
      // de app sem BYPASSRLS — sem isso, todo teste passaria mesmo com a
      // política `tenant_isolation` nunca tendo sido criada.
      await superuserClient.query(
        `create role ${roleName} login password '${rolePassword}' nosuperuser nobypassrls`,
      );
      await superuserClient.query(`grant select, insert on orcamentos to ${roleName}`);

      pool = new Pool({
        connectionString: urlComCredencial(DATABASE_URL as string, roleName, rolePassword),
      });
      dbRestrito = drizzle(pool);
    });

    afterAll(async () => {
      if (idsCriados.length > 0) {
        await superuserClient.query(`delete from orcamentos where id = any($1::uuid[])`, [
          idsCriados,
        ]);
      }
      await pool.end();
      await superuserClient.query(`revoke all on orcamentos from ${roleName}`);
      await superuserClient.query(`drop role ${roleName}`);
      await superuserClient.end();
    });

    it('(a) repositório escopado para Tenant B nunca alcança linha de Tenant A, mesmo buscando por id direto', async () => {
      const idTenantA = randomUUID();
      idsCriados.push(idTenantA);

      const repoTenantA = new RepositorioOrcamentosDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_A),
      );
      await repoTenantA.inserirDeTeste({
        id: idTenantA,
        tenantId: TENANT_A.toString(),
        bucket: 'nexo-orcamentos-raw',
        key: 'k',
        versionId: 'v1',
      });

      // Repositório instanciado com o contexto de Tenant B — mesmo que o
      // método não filtre por tenant_id na query (RLS é quem decide, não a
      // Application), MUST retornar zero linhas.
      const repoTenantB = new RepositorioOrcamentosDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_B),
      );
      const linhas = await repoTenantB.buscarIdPorId(idTenantA);

      expect(linhas).toHaveLength(0);
    });

    it('(a) repositório escopado para Tenant A vê apenas sua própria linha, mesmo com linha de Tenant B na mesma tabela', async () => {
      const idTenantA = randomUUID();
      const idTenantB = randomUUID();
      idsCriados.push(idTenantA, idTenantB);

      const repoTenantA = new RepositorioOrcamentosDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_A),
      );
      await repoTenantA.inserirDeTeste({
        id: idTenantA,
        tenantId: TENANT_A.toString(),
        bucket: 'nexo-orcamentos-raw',
        key: 'k',
        versionId: 'v1',
      });
      const repoTenantB = new RepositorioOrcamentosDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_B),
      );
      await repoTenantB.inserirDeTeste({
        id: idTenantB,
        tenantId: TENANT_B.toString(),
        bucket: 'nexo-orcamentos-raw',
        key: 'k',
        versionId: 'v1',
      });

      const linhasVistasPorA = await repoTenantA.buscarIdPorId(idTenantB);
      expect(linhasVistasPorA).toHaveLength(0);

      const linhasProprias = await repoTenantA.buscarIdPorId(idTenantA);
      expect(linhasProprias).toEqual([idTenantA]);
    });

    it('(b) método de repositório que ignora transacaoTenantScoped falha explicitamente — nunca retorna todas as linhas', async () => {
      const repoTenantA = new RepositorioOrcamentosDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_A),
      );

      // Sem `set_config` algum, a política nega toda leitura (fail-closed) —
      // MUST sempre lançar, nunca devolver linha. A mensagem exata do erro
      // varia conforme o histórico da conexão do pool: numa conexão que
      // nunca viu `app.current_tenant_id` antes, o Postgres levanta
      // "unrecognized configuration parameter" (parâmetro custom nunca
      // registrado na sessão); numa conexão reaproveitada do pool que já
      // executou `set_config(..., true)` em transação anterior (T011/T012
      // acima), o nome do parâmetro já está registrado na sessão e
      // `current_setting` passa a devolver `''` fora do escopo `LOCAL`, o que
      // falha no cast `::uuid` da política ("invalid input syntax for type
      // uuid") — ambos os casos são fail-closed (nunca retornam linha), o que
      // é a garantia de segurança real; nenhum dos dois é reproduzível de
      // forma determinística isolado do resto da suíte, por isso a asserção
      // valida "sempre lança", não uma mensagem específica.
      await expect(repoTenantA.buscarIdPorIdSemEscopo(dbRestrito, randomUUID())).rejects.toThrow();
    });
  },
);
