// Integration test: exercita `DrizzlePgvectorIndiceOrcamentoRepository` (T016)
// contra um Postgres real já migrado (`pnpm db:migrate`), com extensão
// `pgvector` habilitada — prova a tradução linha↔agregado, o roundtrip do
// JSONB de `conteudoIndexavel`, o upsert idempotente com histórico
// append-only (mesmo padrão de `DrizzleOrcamentoValidacaoRepository`, spec
// 003 T014), a busca híbrida (filtro determinístico + distância vetorial) e
// o isolamento multi-tenant via RLS (ADR-005, T015b) — repositório estende
// `DrizzleTenantScopedRepositoryBase` (spec 007/T008).
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`) apontando para um banco já migrado. Sem DATABASE_URL, a suíte
// é pulada (não falha) — CI provisiona o serviço e migra antes de rodar os
// testes (.github/workflows/ci.yml).
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { IndiceOrcamento } from '../../../../../src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.js';
import { ConteudoIndexavel } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/conteudo-indexavel.vo.js';
import { CriterioBusca } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/criterio-busca.vo.js';
import { Embedding } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/origem-validacao.vo.js';
import { DrizzlePgvectorIndiceOrcamentoRepository } from '../../../../../src/bounded-contexts/busca-indexacao/infrastructure/persistence/drizzle-pgvector-indice-orcamento.repository.js';
import { indicesOrcamentoHistorico } from '../../../../../src/bounded-contexts/busca-indexacao/infrastructure/persistence/schema/indice-orcamento.schema.js';
import { criarTenantContext } from '../../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const DATABASE_URL = process.env.DATABASE_URL;

const TENANT_A = TenantId.de('00000000-0000-7000-8000-0000000000aa');
const TENANT_B = TenantId.de('00000000-0000-7000-8000-0000000000bb');

/** BC Busca & Indexação nunca gera `OrcamentoId` (é sempre reutilizado da Ingestão) — gerado só para teste. */
function orcamentoIdDeTeste(): OrcamentoId {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const valor = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return OrcamentoId.de(valor);
}

function conteudoIndexavelDeTeste(categoria = 'informatica'): ConteudoIndexavel {
  return ConteudoIndexavel.de({
    resumoFornecedor: 'Fornecedor de teste',
    itensDescricao: ['Notebook 15 polegadas'],
    condicoesResumo: '30 dias, à vista',
    categorias: [categoria],
  });
}

function vetorDeTeste(preenchimento: number): number[] {
  return new Array(1024).fill(preenchimento);
}

describe.skipIf(!DATABASE_URL)('DrizzlePgvectorIndiceOrcamentoRepository (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;
  let repo: DrizzlePgvectorIndiceOrcamentoRepository;
  const idsParaLimpar: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
    repo = new DrizzlePgvectorIndiceOrcamentoRepository(db, criarTenantContext(TENANT_A));
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    // `indices_orcamento_historico` é append-only (T015, trigger bloqueia
    // DELETE/UPDATE por linha) — a limpeza de teste desativa os triggers só
    // nesta sessão (`session_replication_role`), nunca em produção. RLS
    // (T015b) não bloqueia esta conexão porque ela usa a role superuser
    // local de dev/CI (`nexo`, BYPASSRLS) — nenhuma asserção deste arquivo
    // depende disso, é só limpeza.
    await client.query("set session_replication_role = 'replica'");
    try {
      while (idsParaLimpar.length > 0) {
        const id = idsParaLimpar.pop()!;
        await client.query(
          'delete from busca_indexacao.indices_orcamento_historico where indice_orcamento_id = $1',
          [id],
        );
        await client.query('delete from busca_indexacao.indices_orcamento where id = $1', [id]);
      }
    } finally {
      await client.query("set session_replication_role = 'origin'");
    }
  });

  it('buscarPorOrcamentoId retorna undefined para orcamentoId inexistente', async () => {
    await expect(repo.buscarPorOrcamentoId(orcamentoIdDeTeste())).resolves.toBeUndefined();
  });

  it('upsert idempotente: PENDENTE inicial, depois INDEXADO com embedding e 1 entrada de histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const indice = IndiceOrcamento.criar({
      orcamentoId: id,
      tenantId: TENANT_A,
      conteudoIndexavel: conteudoIndexavelDeTeste(),
      origemValidacao: OrigemValidacao.de('VALIDADO'),
    });
    await repo.upsert(indice);

    const pendente = await repo.buscarPorOrcamentoId(id);
    expect(pendente?.estado).toBe('PENDENTE');
    expect(pendente?.embedding).toBeUndefined();
    expect(pendente?.conteudoIndexavel.resumoFornecedor).toBe('Fornecedor de teste');
    expect(pendente?.tenantId.equals(TENANT_A)).toBe(true);

    const embedding = Embedding.de({
      vetor: vetorDeTeste(0.1),
      dimensao: 1024,
      modeloId: 'amazon.titan-embed-text-v2:0',
      geradoEm: new Date('2026-07-30T10:00:00.000Z'),
    });
    pendente!.registrarTentativaIndexacao({
      resultado: 'INDEXADO',
      timestamp: new Date('2026-07-30T10:00:01.000Z'),
      embedding,
    });
    await repo.upsert(pendente!);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.estado).toBe('INDEXADO');
    expect(final?.embedding?.vetor).toHaveLength(1024);
    expect(final?.embedding?.modeloId).toBe('amazon.titan-embed-text-v2:0');
    expect(final?.historico).toHaveLength(1);
    expect(final?.historico[0]?.resultado).toBe('INDEXADO');
  });

  it('falha técnica seguida de retry bem-sucedido produz 2 entradas de histórico, sem sobrescrever a primeira', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const indice = IndiceOrcamento.criar({
      orcamentoId: id,
      tenantId: TENANT_A,
      conteudoIndexavel: conteudoIndexavelDeTeste(),
      origemValidacao: OrigemValidacao.de('VALIDADO_COM_RESSALVA'),
    });
    indice.registrarTentativaIndexacao({
      resultado: 'FALHA_TECNICA',
      timestamp: new Date('2026-07-30T11:00:00.000Z'),
      motivoFalha: 'serviço de embeddings indisponível',
    });
    await repo.upsert(indice);

    const comFalha = await repo.buscarPorOrcamentoId(id);
    expect(comFalha?.estado).toBe('FALHA_INDEXACAO');
    expect(comFalha?.historico).toHaveLength(1);

    comFalha!.registrarTentativaIndexacao({
      resultado: 'INDEXADO',
      timestamp: new Date('2026-07-30T11:05:00.000Z'),
      embedding: Embedding.de({
        vetor: vetorDeTeste(0.2),
        dimensao: 1024,
        modeloId: 'amazon.titan-embed-text-v2:0',
        geradoEm: new Date('2026-07-30T11:05:00.000Z'),
      }),
    });
    await repo.upsert(comFalha!);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.estado).toBe('INDEXADO');
    expect(final?.origemValidacao.valor).toBe('VALIDADO_COM_RESSALVA');
    expect(final?.historico).toHaveLength(2);
    expect(final?.historico[0]?.resultado).toBe('FALHA_TECNICA');
    expect(final?.historico[1]?.resultado).toBe('INDEXADO');
  });

  it('re-upsert do mesmo agregado sem transição nova não duplica histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const indice = IndiceOrcamento.criar({
      orcamentoId: id,
      tenantId: TENANT_A,
      conteudoIndexavel: conteudoIndexavelDeTeste(),
      origemValidacao: OrigemValidacao.de('VALIDADO'),
    });
    indice.registrarTentativaIndexacao({
      resultado: 'INDEXADO',
      timestamp: new Date('2026-07-30T12:00:00.000Z'),
      embedding: Embedding.de({
        vetor: vetorDeTeste(0.3),
        dimensao: 1024,
        modeloId: 'amazon.titan-embed-text-v2:0',
        geradoEm: new Date('2026-07-30T12:00:00.000Z'),
      }),
    });
    await repo.upsert(indice);

    const carregado = await repo.buscarPorOrcamentoId(id);
    await repo.upsert(carregado!); // nenhuma transição nova aplicada

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.historico).toHaveLength(1);
  });

  it('duas chamadas concorrentes de upsert() para o mesmo orcamentoId (retry) produzem exatamente 1 entrada de histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const clienteB = new Client({ connectionString: DATABASE_URL });
    await clienteB.connect();
    const repoB = new DrizzlePgvectorIndiceOrcamentoRepository(
      drizzle(clienteB),
      criarTenantContext(TENANT_A),
    );

    try {
      const indiceA = IndiceOrcamento.criar({
        orcamentoId: id,
        tenantId: TENANT_A,
        conteudoIndexavel: conteudoIndexavelDeTeste(),
        origemValidacao: OrigemValidacao.de('VALIDADO'),
      });
      indiceA.registrarTentativaIndexacao({
        resultado: 'INDEXADO',
        timestamp: new Date('2026-07-30T13:00:00.000Z'),
        embedding: Embedding.de({
          vetor: vetorDeTeste(0.4),
          dimensao: 1024,
          modeloId: 'amazon.titan-embed-text-v2:0',
          geradoEm: new Date('2026-07-30T13:00:00.000Z'),
        }),
      });

      const indiceB = IndiceOrcamento.criar({
        orcamentoId: id,
        tenantId: TENANT_A,
        conteudoIndexavel: conteudoIndexavelDeTeste(),
        origemValidacao: OrigemValidacao.de('VALIDADO'),
      });
      indiceB.registrarTentativaIndexacao({
        resultado: 'INDEXADO',
        timestamp: new Date('2026-07-30T13:00:00.000Z'),
        embedding: Embedding.de({
          vetor: vetorDeTeste(0.4),
          dimensao: 1024,
          modeloId: 'amazon.titan-embed-text-v2:0',
          geradoEm: new Date('2026-07-30T13:00:00.000Z'),
        }),
      });

      await Promise.all([repo.upsert(indiceA), repoB.upsert(indiceB)]);

      const linhasHistorico = await db
        .select()
        .from(indicesOrcamentoHistorico)
        .where(eq(indicesOrcamentoHistorico.indiceOrcamentoId, id.toString()));
      expect(linhasHistorico).toHaveLength(1);

      const final = await repo.buscarPorOrcamentoId(id);
      expect(final?.estado).toBe('INDEXADO');
      expect(final?.historico).toHaveLength(1);
    } finally {
      await clienteB.end();
    }
  });

  it('upsert rejeita agregado com tenantId diferente do TenantContext da instância', async () => {
    const id = orcamentoIdDeTeste();

    const indiceDeOutroTenant = IndiceOrcamento.criar({
      orcamentoId: id,
      tenantId: TENANT_B,
      conteudoIndexavel: conteudoIndexavelDeTeste(),
      origemValidacao: OrigemValidacao.de('VALIDADO'),
    });

    // `repo` foi construído com TENANT_A — agregado é de TENANT_B.
    await expect(repo.upsert(indiceDeOutroTenant)).rejects.toThrow();
  });

  // Isolamento cross-tenant de fato (RLS bloqueando sob role sem BYPASSRLS)
  // é responsabilidade de tests/security/isolamento-multitenant/busca-indexacao.test.ts
  // (T027b) — a role `nexo` usada nesta suíte é superuser/BYPASSRLS (mesma
  // observação de rls-enforcement-busca-indexacao.test.ts), então qualquer
  // asserção de "Tenant B nunca vê linha de Tenant A" aqui passaria mesmo que
  // a política `tenant_isolation` nunca tivesse sido criada — não é uma prova
  // real. Este teste confirma apenas que `upsert` persiste o `tenantId`
  // correto na coluna (correção de tradução linha↔agregado, não enforcement).
  it('upsert persiste o tenantId correto na coluna tenant_id', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const indice = IndiceOrcamento.criar({
      orcamentoId: id,
      tenantId: TENANT_A,
      conteudoIndexavel: conteudoIndexavelDeTeste(),
      origemValidacao: OrigemValidacao.de('VALIDADO'),
    });
    await repo.upsert(indice);

    const resultado = await client.query<{ tenant_id: string }>(
      'select tenant_id from busca_indexacao.indices_orcamento where id = $1',
      [id.toString()],
    );
    expect(resultado.rows[0]?.tenant_id).toBe(TENANT_A.toString());
  });

  describe('buscarPorCriterioEVetor', () => {
    it('filtra por categoria (JSONB) e ordena por distância vetorial, ignorando itens não INDEXADOS', async () => {
      const idProximo = orcamentoIdDeTeste();
      const idDistante = orcamentoIdDeTeste();
      const idOutraCategoria = orcamentoIdDeTeste();
      const idPendente = orcamentoIdDeTeste();
      idsParaLimpar.push(
        idProximo.toString(),
        idDistante.toString(),
        idOutraCategoria.toString(),
        idPendente.toString(),
      );

      const vetorConsulta = vetorDeTeste(1);

      const indexar = async (
        orcamentoId: OrcamentoId,
        categoria: string,
        preenchimentoVetor: number,
      ) => {
        const indice = IndiceOrcamento.criar({
          orcamentoId,
          tenantId: TENANT_A,
          conteudoIndexavel: conteudoIndexavelDeTeste(categoria),
          origemValidacao: OrigemValidacao.de('VALIDADO'),
        });
        indice.registrarTentativaIndexacao({
          resultado: 'INDEXADO',
          timestamp: new Date('2026-07-30T14:00:00.000Z'),
          embedding: Embedding.de({
            vetor: vetorDeTeste(preenchimentoVetor),
            dimensao: 1024,
            modeloId: 'amazon.titan-embed-text-v2:0',
            geradoEm: new Date('2026-07-30T14:00:00.000Z'),
          }),
        });
        await repo.upsert(indice);
      };

      await indexar(idProximo, 'informatica', 1); // idêntico ao vetor de consulta
      await indexar(idDistante, 'informatica', -1); // categoria igual, vetor oposto
      await indexar(idOutraCategoria, 'moveis', 1); // vetor idêntico, categoria diferente

      const indicePendente = IndiceOrcamento.criar({
        orcamentoId: idPendente,
        tenantId: TENANT_A,
        conteudoIndexavel: conteudoIndexavelDeTeste('informatica'),
        origemValidacao: OrigemValidacao.de('VALIDADO'),
      });
      await repo.upsert(indicePendente); // permanece PENDENTE, sem embedding

      const criterio = CriterioBusca.de({ categoria: 'informatica', textoLivreResidual: '' });
      const vetorConsultaVo = Embedding.de({
        vetor: vetorConsulta,
        dimensao: 1024,
        modeloId: 'amazon.titan-embed-text-v2:0',
        geradoEm: new Date('2026-07-30T14:00:01.000Z'),
      });

      const resultados = await repo.buscarPorCriterioEVetor(criterio, vetorConsultaVo, 10);
      const idsResultado = resultados.map((r) => r.orcamentoId.toString());

      expect(idsResultado).toContain(idProximo.toString());
      expect(idsResultado).toContain(idDistante.toString());
      expect(idsResultado).not.toContain(idOutraCategoria.toString());
      expect(idsResultado).not.toContain(idPendente.toString());
      expect(idsResultado[0]).toBe(idProximo.toString()); // mais próximo do vetor de consulta primeiro
      expect(resultados[0]?.scoreRelevancia).toBeGreaterThan(resultados[1]?.scoreRelevancia ?? 0);
    });

    it('sem vetor de consulta, aplica apenas o filtro determinístico (categoria + estado INDEXADO)', async () => {
      const id = orcamentoIdDeTeste();
      idsParaLimpar.push(id.toString());

      const indice = IndiceOrcamento.criar({
        orcamentoId: id,
        tenantId: TENANT_A,
        conteudoIndexavel: conteudoIndexavelDeTeste('eletronicos'),
        origemValidacao: OrigemValidacao.de('VALIDADO'),
      });
      indice.registrarTentativaIndexacao({
        resultado: 'INDEXADO',
        timestamp: new Date('2026-07-30T15:00:00.000Z'),
        embedding: Embedding.de({
          vetor: vetorDeTeste(0.5),
          dimensao: 1024,
          modeloId: 'amazon.titan-embed-text-v2:0',
          geradoEm: new Date('2026-07-30T15:00:00.000Z'),
        }),
      });
      await repo.upsert(indice);

      const criterio = CriterioBusca.de({ categoria: 'eletronicos', textoLivreResidual: '' });
      const resultados = await repo.buscarPorCriterioEVetor(criterio, undefined, 10);

      expect(resultados.map((r) => r.orcamentoId.toString())).toContain(id.toString());
    });
  });
});
