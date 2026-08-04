// Integration test: exercita `DrizzleOrcamentoRepository` (T011) contra um
// Postgres real já migrado (`pnpm db:migrate`), não um mock — prova a
// tradução linha↔agregado e, sobretudo, a serialização via `SELECT ... FOR
// UPDATE` introduzida na revisão (achado MAJOR: sem o lock, dois `salvar`
// concorrentes do mesmo agregado duplicavam a mesma tentativa em
// `orcamentos_historico`) e o isolamento multi-tenant via RLS (ADR-005,
// T007) — repositório estende `DrizzleTenantScopedRepositoryBase` (spec
// 007/T008/T018).
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`) apontando para um banco já migrado. Sem DATABASE_URL, a suíte
// é pulada (não falha) — CI provisiona o serviço e migra antes de rodar os
// testes (.github/workflows/ci.yml).
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Orcamento } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import { Canal } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { ResultadoClassificacao } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import { DrizzleOrcamentoRepository } from '../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/drizzle-orcamento.repository.js';
import {
  orcamentos,
  orcamentosHistorico,
} from '../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/persistence/schema/orcamento.schema.js';
import { criarTenantContext } from '../../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_A = TenantId.de('00000000-0000-7000-8000-0000000000aa');

function referenciaBruta(key: string): ReferenciaS3 {
  return ReferenciaS3.de({ bucket: 'nexo-orcamentos-raw', key, versionId: 'v1' });
}

function resultado(nivelConfianca: number): ResultadoClassificacao {
  return ResultadoClassificacao.criar({
    fornecedorIdentificado: 'fornecedor-x',
    formatoIdentificado: 'PDF',
    nivelConfianca: NivelConfianca.de(nivelConfianca),
    agenteOrigem: 'CLASSIFICADOR',
  });
}

function resultadoHumano(): ResultadoClassificacao {
  return ResultadoClassificacao.criar({
    fornecedorIdentificado: 'fornecedor-x-confirmado',
    formatoIdentificado: 'PDF',
    nivelConfianca: NivelConfianca.de(100),
    agenteOrigem: 'HUMANO',
  });
}

// `salvar` abre sua própria transação (lock + insert) — não pode ser
// aninhada sob um BEGIN externo revertido ao final (a transação interna do
// Drizzle commitaria a externa junto). Cada teste gera seu próprio
// `OrcamentoId` e limpa explicitamente as linhas que criou.
describe.skipIf(!DATABASE_URL)('DrizzleOrcamentoRepository (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;
  let repo: DrizzleOrcamentoRepository;
  const idsParaLimpar: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
    repo = new DrizzleOrcamentoRepository(db, criarTenantContext(TENANT_A));
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    // `orcamentos_historico` é append-only (T010, trigger bloqueia
    // DELETE/UPDATE por linha) — a limpeza de teste desativa os triggers só
    // nesta sessão (`session_replication_role`), nunca em produção.
    await client.query("set session_replication_role = 'replica'");
    try {
      while (idsParaLimpar.length > 0) {
        const id = idsParaLimpar.pop()!;
        await client.query('delete from orcamentos_historico where orcamento_id = $1', [id]);
        await client.query('delete from orcamentos where id = $1', [id]);
      }
    } finally {
      await client.query("set session_replication_role = 'origin'");
    }
  });

  it('buscarPorId retorna undefined para orcamentoId inexistente', async () => {
    const id = OrcamentoId.novo();
    await expect(repo.buscarPorId(id)).resolves.toBeUndefined();
  });

  // Isolamento cross-tenant de fato (RLS bloqueando sob role sem BYPASSRLS)
  // é responsabilidade de tests/security/isolamento-multitenant/rls-enforcement.test.ts
  // — a role `nexo` usada nesta suíte é superuser/BYPASSRLS, então qualquer
  // asserção de "tenant B nunca vê linha de tenant A" aqui passaria mesmo que
  // a política `tenant_isolation` nunca tivesse sido criada, não é uma prova
  // real. Este teste confirma apenas que `salvar` persiste o `tenantId`
  // correto na coluna (correção de tradução linha↔agregado, T018).
  it('salvar persiste o tenantId do TenantContext da instância na coluna tenant_id', async () => {
    const id = OrcamentoId.novo();
    idsParaLimpar.push(id.toString());

    const recebido = Orcamento.receber({
      id,
      canal: Canal.de('API_REST'),
      referenciaBruta: referenciaBruta('doc-tenant.pdf'),
    });
    await repo.salvar(recebido);

    const resultado = await client.query<{ tenant_id: string }>(
      'select tenant_id from orcamentos where id = $1',
      [id.toString()],
    );
    expect(resultado.rows[0]?.tenant_id).toBe(TENANT_A.toString());

    const historico = await client.query<{ tenant_id: string }>(
      'select tenant_id from orcamentos_historico where orcamento_id = $1',
      [id.toString()],
    );
    for (const linha of historico.rows) {
      expect(linha.tenant_id).toBe(TENANT_A.toString());
    }
  });

  it('salva RECEBIDO, aplica classificação de alta confiança e recarrega como CLASSIFICADO com 1 entrada de histórico', async () => {
    const id = OrcamentoId.novo();
    idsParaLimpar.push(id.toString());

    const recebido = Orcamento.receber({
      id,
      canal: Canal.de('API_REST'),
      referenciaBruta: referenciaBruta('doc-1.pdf'),
    });
    await repo.salvar(recebido);

    const carregado = await repo.buscarPorId(id);
    expect(carregado?.status).toBe('RECEBIDO');

    carregado!.registrarTentativaClassificador(resultado(90));
    await repo.salvar(carregado!);

    const final = await repo.buscarPorId(id);
    expect(final?.status).toBe('CLASSIFICADO');
    expect(final?.historico).toHaveLength(1);
    expect(final?.historico[0]?.agente).toBe('CLASSIFICADOR');
    expect(final?.resultadoAtual?.fornecedorIdentificado).toBe('fornecedor-x');
  });

  it('confiança baixa escalona para PENDENTE_REVISAO_HUMANA; confirmação humana recarrega como CLASSIFICADO com 2 entradas de histórico', async () => {
    const id = OrcamentoId.novo();
    idsParaLimpar.push(id.toString());

    const recebido = Orcamento.receber({
      id,
      canal: Canal.de('PORTAL_WEB'),
      referenciaBruta: referenciaBruta('doc-2.pdf'),
    });
    recebido.registrarTentativaClassificador(resultado(50));
    expect(recebido.status).toBe('PENDENTE_REVISAO_HUMANA');
    await repo.salvar(recebido);

    const pendente = await repo.buscarPorId(id);
    expect(pendente?.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(pendente?.historico).toHaveLength(1);

    pendente!.registrarConfirmacaoHumana(resultadoHumano());
    await repo.salvar(pendente!);

    const final = await repo.buscarPorId(id);
    expect(final?.status).toBe('CLASSIFICADO');
    expect(final?.historico).toHaveLength(2);
    expect(final?.historico[0]?.agente).toBe('CLASSIFICADOR');
    expect(final?.historico[1]?.agente).toBe('HUMANO');
  });

  it('re-salvar o mesmo agregado sem transição nova não duplica histórico', async () => {
    const id = OrcamentoId.novo();
    idsParaLimpar.push(id.toString());

    const recebido = Orcamento.receber({
      id,
      canal: Canal.de('APP_MOBILE'),
      referenciaBruta: referenciaBruta('doc-3.pdf'),
    });
    recebido.registrarTentativaClassificador(resultado(95));
    await repo.salvar(recebido);

    const carregado = await repo.buscarPorId(id);
    await repo.salvar(carregado!); // nenhuma transição nova aplicada

    const final = await repo.buscarPorId(id);
    expect(final?.historico).toHaveLength(1);
  });

  it('duas chamadas concorrentes de salvar() para o mesmo orcamentoId (retry) produzem exatamente 1 entrada de histórico', async () => {
    const id = OrcamentoId.novo();
    idsParaLimpar.push(id.toString());

    // Segunda conexão real — concorrência genuína exige duas transações em
    // sessões distintas, não duas chamadas sequenciais na mesma conexão.
    const clienteB = new Client({ connectionString: DATABASE_URL });
    await clienteB.connect();
    const repoB = new DrizzleOrcamentoRepository(drizzle(clienteB), criarTenantContext(TENANT_A));

    try {
      // Duas instâncias em memória do mesmo agregado, cada uma aplicando a
      // mesma transição — simula a invocação original + retry de Lambda
      // chegando aos dois handlers ao mesmo tempo.
      const agregadoA = Orcamento.receber({
        id,
        canal: Canal.de('SFTP'),
        referenciaBruta: referenciaBruta('doc-4.pdf'),
      });
      agregadoA.registrarTentativaClassificador(resultado(88));

      const agregadoB = Orcamento.receber({
        id,
        canal: Canal.de('SFTP'),
        referenciaBruta: referenciaBruta('doc-4.pdf'),
      });
      agregadoB.registrarTentativaClassificador(resultado(88));

      await Promise.all([repo.salvar(agregadoA), repoB.salvar(agregadoB)]);

      const linhasHistorico = await db
        .select()
        .from(orcamentosHistorico)
        .where(eq(orcamentosHistorico.orcamentoId, id.toString()));
      expect(linhasHistorico).toHaveLength(1);

      const final = await repo.buscarPorId(id);
      expect(final?.status).toBe('CLASSIFICADO');
      expect(final?.historico).toHaveLength(1);

      const linhaOrcamento = await db
        .select()
        .from(orcamentos)
        .where(eq(orcamentos.id, id.toString()));
      expect(linhaOrcamento).toHaveLength(1);
    } finally {
      await clienteB.end();
    }
  });
});
