// Suíte adversarial (T027b, ADR-005) — mesmo padrão de
// repositorio-tenant-scoped-adversarial.test.ts (T010, spec 007), aplicado
// às tabelas indices_orcamento/indices_orcamento_historico (T015b). Cobre os
// mesmos 2 vetores de vazamento cross-tenant através do caminho de produção
// real (`DrizzleTenantScopedRepositoryBase`), não apenas SQL cru:
//
// (a) repositório "trocado" — instância escopada para Tenant B tentando
//     alcançar uma linha de Tenant A: a RLS (T015b) bloqueia
//     independentemente do filtro que o código da Application aplique (ou
//     deixe de aplicar) na query.
// (b) sessão sem `set_config`/`SET LOCAL` — simulada aqui via um método de
//     repositório que (por bug) ignora `transacaoTenantScoped` e chama
//     `db.transaction` diretamente: MUST falhar explicitamente (fail-closed),
//     nunca retornar todas as linhas.
//
// Não depende de #176 (T016, DrizzlePgvectorIndiceOrcamentoRepository) —
// como em T010/spec 007, usa um repositório mínimo de teste que estende
// `DrizzleTenantScopedRepositoryBase` (spec 007, T008), exercitando a
// garantia estrutural da classe base independentemente de o repositório
// concreto do BC já existir.
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
 * correto, T008) sobre `busca_indexacao.indices_orcamento`/
 * `indices_orcamento_historico`, e expõe também um método que o ignora de
 * propósito, para provar o vetor (b) do checkpoint. Não é o repositório
 * concreto do BC (T016/#176) — mesma decisão de escopo de
 * `repositorio-tenant-scoped-adversarial.test.ts` (T010, spec 007).
 */
class RepositorioIndicesOrcamentoDeTeste extends DrizzleTenantScopedRepositoryBase {
  constructor(db: NodePgDatabase, tenantContext: TenantContext) {
    super(db, tenantContext);
  }

  /** Caminho correto: `SET LOCAL app.current_tenant_id` sempre antes da query. */
  async buscarIdPorId(id: string): Promise<string[]> {
    return this.transacaoTenantScoped(async (tx) => {
      const resultado = await tx.execute(
        sql`select id from busca_indexacao.indices_orcamento where id = ${id}`,
      );
      return resultado.rows.map((linha) => (linha as { id: string }).id);
    });
  }

  /** Wrapper público para os testes inserirem fixtures pelo caminho correto (T008). */
  async inserirDeTeste(campos: { id: string; tenantId: string }): Promise<void> {
    await this.transacaoTenantScoped(async (tx) => {
      await tx.execute(
        sql`insert into busca_indexacao.indices_orcamento (id, tenant_id, estado, conteudo_indexavel, origem_validacao)
            values (${campos.id}, ${campos.tenantId}, 'PENDENTE', '{}'::jsonb, 'VALIDADO')`,
      );
    });
  }

  /** Idem, para o histórico append-only (FK para indices_orcamento). */
  async inserirHistoricoDeTeste(campos: {
    indiceOrcamentoId: string;
    tenantId: string;
  }): Promise<void> {
    await this.transacaoTenantScoped(async (tx) => {
      await tx.execute(
        sql`insert into busca_indexacao.indices_orcamento_historico (tenant_id, indice_orcamento_id, resultado, ocorreu_em)
            values (${campos.tenantId}, ${campos.indiceOrcamentoId}, 'FALHA_TECNICA', now())`,
      );
    });
  }

  async buscarHistoricoPorIndiceId(indiceOrcamentoId: string): Promise<string[]> {
    return this.transacaoTenantScoped(async (tx) => {
      const resultado = await tx.execute(
        sql`select id from busca_indexacao.indices_orcamento_historico where indice_orcamento_id = ${indiceOrcamentoId}`,
      );
      return resultado.rows.map((linha) => String((linha as { id: unknown }).id));
    });
  }

  /**
   * Caminho incorreto, deliberado — simula um desenvolvedor que criou um
   * método de repositório sem estender `transacaoTenantScoped` (bug real
   * possível em código futuro).
   */
  async buscarIdPorIdSemEscopo(db: NodePgDatabase, id: string): Promise<string[]> {
    return db.transaction(async (tx) => {
      const resultado = await tx.execute(
        sql`select id from busca_indexacao.indices_orcamento where id = ${id}`,
      );
      return resultado.rows.map((linha) => (linha as { id: string }).id);
    });
  }
}

describe.skipIf(!DATABASE_URL)(
  'DrizzleTenantScopedRepositoryBase — adversarial cross-tenant em indices_orcamento (T027b)',
  () => {
    const roleName = `rls_repo_bi_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const rolePassword = randomUUID();

    let superuserClient: Client;
    let pool: Pool;
    let dbRestrito: NodePgDatabase;
    const idsCriados: string[] = [];

    beforeAll(async () => {
      superuserClient = new Client({ connectionString: DATABASE_URL });
      await superuserClient.connect();

      // Mesmo perfil exigido pelo checklist de infraestrutura (T009 da spec
      // 007): role de app sem BYPASSRLS — sem isso, todo teste passaria mesmo
      // com a política `tenant_isolation` (T015b) nunca tendo sido criada.
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

      pool = new Pool({
        connectionString: urlComCredencial(DATABASE_URL as string, roleName, rolePassword),
      });
      dbRestrito = drizzle(pool);
    });

    afterAll(async () => {
      if (idsCriados.length > 0) {
        // indices_orcamento_historico é append-only (trigger bloqueia DELETE
        // mesmo para superuser) — desabilita só para a limpeza de teste.
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
      await pool.end();
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

    it('(a) repositório escopado para Tenant B nunca alcança linha de Tenant A em indices_orcamento, mesmo buscando por id direto', async () => {
      const idTenantA = randomUUID();
      idsCriados.push(idTenantA);

      const repoTenantA = new RepositorioIndicesOrcamentoDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_A),
      );
      await repoTenantA.inserirDeTeste({ id: idTenantA, tenantId: TENANT_A.toString() });

      // Repositório instanciado com o contexto de Tenant B — mesmo que o
      // método não filtre por tenant_id na query (RLS é quem decide, não a
      // Application), MUST retornar zero linhas.
      const repoTenantB = new RepositorioIndicesOrcamentoDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_B),
      );
      const linhas = await repoTenantB.buscarIdPorId(idTenantA);

      expect(linhas).toHaveLength(0);
    });

    it('(a) repositório escopado para Tenant A vê apenas sua própria linha em indices_orcamento, mesmo com linha de Tenant B na mesma tabela', async () => {
      const idTenantA = randomUUID();
      const idTenantB = randomUUID();
      idsCriados.push(idTenantA, idTenantB);

      const repoTenantA = new RepositorioIndicesOrcamentoDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_A),
      );
      await repoTenantA.inserirDeTeste({ id: idTenantA, tenantId: TENANT_A.toString() });
      const repoTenantB = new RepositorioIndicesOrcamentoDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_B),
      );
      await repoTenantB.inserirDeTeste({ id: idTenantB, tenantId: TENANT_B.toString() });

      const linhasVistasPorA = await repoTenantA.buscarIdPorId(idTenantB);
      expect(linhasVistasPorA).toHaveLength(0);

      const linhasProprias = await repoTenantA.buscarIdPorId(idTenantA);
      expect(linhasProprias).toEqual([idTenantA]);
    });

    it('(a) repositório escopado para Tenant B nunca alcança histórico de Tenant A em indices_orcamento_historico', async () => {
      const idTenantA = randomUUID();
      idsCriados.push(idTenantA);

      const repoTenantA = new RepositorioIndicesOrcamentoDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_A),
      );
      await repoTenantA.inserirDeTeste({ id: idTenantA, tenantId: TENANT_A.toString() });
      await repoTenantA.inserirHistoricoDeTeste({
        indiceOrcamentoId: idTenantA,
        tenantId: TENANT_A.toString(),
      });

      const repoTenantB = new RepositorioIndicesOrcamentoDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_B),
      );
      const historicoVistoPorB = await repoTenantB.buscarHistoricoPorIndiceId(idTenantA);

      expect(historicoVistoPorB).toHaveLength(0);
    });

    it('(b) método de repositório que ignora transacaoTenantScoped falha explicitamente — nunca retorna todas as linhas', async () => {
      const repoTenantA = new RepositorioIndicesOrcamentoDeTeste(
        dbRestrito,
        criarTenantContext(TENANT_A),
      );

      // Sem `set_config` algum, a política nega toda leitura (fail-closed) —
      // MUST sempre lançar, nunca devolver linha. Mesma nota de
      // não-determinismo da mensagem de erro documentada em
      // repositorio-tenant-scoped-adversarial.test.ts (T010): a asserção
      // valida "sempre lança", não uma mensagem específica.
      await expect(repoTenantA.buscarIdPorIdSemEscopo(dbRestrito, randomUUID())).rejects.toThrow();
    });
  },
);
