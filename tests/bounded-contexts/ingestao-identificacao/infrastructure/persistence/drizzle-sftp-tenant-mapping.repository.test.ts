// Integration test: exercita `DrizzleSftpTenantMappingRepository` (T006)
// contra um Postgres real já migrado — requer DATABASE_URL (ver
// .env.example / docker-compose.yml); sem ela, a suíte é pulada (CI migra e
// provisiona antes de rodar, .github/workflows/ci.yml).
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TenantId } from '../../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { DrizzleSftpTenantMappingRepository } from '../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/drizzle-sftp-tenant-mapping.repository.js';
import { sftpTenantMapping } from '../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/schema/sftp-tenant-mapping.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('DrizzleSftpTenantMappingRepository (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;
  let repo: DrizzleSftpTenantMappingRepository;
  const servidoresParaLimpar: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
    repo = new DrizzleSftpTenantMappingRepository(db);
  });

  afterEach(async () => {
    for (const servidorId of servidoresParaLimpar.splice(0)) {
      await db.delete(sftpTenantMapping).where(eq(sftpTenantMapping.servidorId, servidorId));
    }
  });

  afterAll(async () => {
    await client.end();
  });

  it('resolve o tenantId de um mapeamento existente', async () => {
    const servidorId = `srv-teste-${TenantId.novo().toString()}`;
    const tenantId = TenantId.novo();
    servidoresParaLimpar.push(servidorId);
    await db
      .insert(sftpTenantMapping)
      .values({ servidorId, usuario: 'usuario-1', tenantId: tenantId.toString() });

    const resolvido = await repo.resolverTenantId(servidorId, 'usuario-1');

    expect(resolvido?.toString()).toBe(tenantId.toString());
  });

  it('retorna undefined quando não há mapeamento para o par servidor/usuário', async () => {
    const resolvido = await repo.resolverTenantId('srv-inexistente', 'usuario-inexistente');

    expect(resolvido).toBeUndefined();
  });

  it('não confunde usuários diferentes do mesmo servidor', async () => {
    const servidorId = `srv-teste-${TenantId.novo().toString()}`;
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    servidoresParaLimpar.push(servidorId);
    await db.insert(sftpTenantMapping).values([
      { servidorId, usuario: 'usuario-a', tenantId: tenantA.toString() },
      { servidorId, usuario: 'usuario-b', tenantId: tenantB.toString() },
    ]);

    const resolvidoA = await repo.resolverTenantId(servidorId, 'usuario-a');
    const resolvidoB = await repo.resolverTenantId(servidorId, 'usuario-b');

    expect(resolvidoA?.toString()).toBe(tenantA.toString());
    expect(resolvidoB?.toString()).toBe(tenantB.toString());
  });
});
