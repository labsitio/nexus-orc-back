// Integration test: exercita `DrizzleExtracaoOrcamentoRepository` (T013)
// contra um Postgres real já migrado (`pnpm db:migrate`), não um mock —
// prova a tradução linha↔agregado, o roundtrip do JSONB de itens/condições
// comerciais e a serialização via `SELECT ... FOR UPDATE` (mesmo padrão de
// `DrizzleOrcamentoRepository`, spec 001 T011).
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
import { ExtracaoOrcamento } from '../../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
import { CampoExtraido } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/condicoes-comerciais.vo.js';
import { DescricaoProduto } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/descricao-produto.vo.js';
import { Dinheiro } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/dinheiro.vo.js';
import { ItemOrcamento } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/periodo-validade.vo.js';
import { Quantidade } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/quantidade.vo.js';
import { ReferenciaClassificacao } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-classificacao.vo.js';
import { ReferenciaS3 } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-s3.vo.js';
import { DrizzleExtracaoOrcamentoRepository } from '../../../../../src/bounded-contexts/extracao/infrastructure/persistence/drizzle-extracao-orcamento.repository.js';
import {
  extracoesOrcamento,
  extracoesOrcamentoHistorico,
} from '../../../../../src/bounded-contexts/extracao/infrastructure/persistence/schema/extracao-orcamento.schema.js';
import { TenantId } from '../../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const DATABASE_URL = process.env.DATABASE_URL;

const confiancaAlta = NivelConfianca.de(95);
const confiancaBaixa = NivelConfianca.de(20);

/** BC Extração nunca gera `OrcamentoId` (é sempre reutilizado da Ingestão) — gerado só para teste. */
function orcamentoIdDeTeste(): OrcamentoId {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const valor = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return OrcamentoId.de(valor);
}

function referenciaClassificacao(): ReferenciaClassificacao {
  return ReferenciaClassificacao.de({
    fornecedorIdentificado: 'fornecedor-x',
    formatoIdentificado: 'PDF',
    agenteOrigem: 'CLASSIFICADOR',
  });
}

function referenciaBruta(key: string): ReferenciaS3 {
  return ReferenciaS3.de({ bucket: 'nexo-orcamentos-raw', key, versionId: 'v1' });
}

function itemCompleto(agente: 'EXTRATOR' | 'HUMANO' = 'EXTRATOR'): ItemOrcamento {
  return ItemOrcamento.de({
    descricao: CampoExtraido.extraido(
      DescricaoProduto.de('Parafuso M6', 'SKU-1'),
      confiancaAlta,
      agente,
    ),
    quantidade: CampoExtraido.extraido(Quantidade.de(100), confiancaAlta, agente),
    precoUnitario: CampoExtraido.extraido(Dinheiro.de(1050, 'BRL'), confiancaAlta, agente),
  });
}

function itemIncompleto(): ItemOrcamento {
  return ItemOrcamento.de({
    descricao: CampoExtraido.extraido(
      DescricaoProduto.de('Parafuso M6'),
      confiancaAlta,
      'EXTRATOR',
    ),
    quantidade: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
    precoUnitario: CampoExtraido.extraido(Dinheiro.de(1050, 'BRL'), confiancaAlta, 'EXTRATOR'),
  });
}

function condicoesCompletas(agente: 'EXTRATOR' | 'HUMANO' = 'EXTRATOR'): CondicoesComerciais {
  return CondicoesComerciais.de({
    condicoesPagamento: CampoExtraido.extraido('30 dias', confiancaAlta, agente),
    prazoValidade: CampoExtraido.extraido(
      PeriodoValidade.de(new Date('2026-12-31T00:00:00.000Z')),
      confiancaAlta,
      agente,
    ),
    condicoesEntrega: CampoExtraido.extraido('FOB', confiancaAlta, agente),
  });
}

// `salvar` abre sua própria transação (lock + insert) — cada teste gera seu
// próprio `OrcamentoId` e limpa explicitamente as linhas que criou.
describe.skipIf(!DATABASE_URL)('DrizzleExtracaoOrcamentoRepository (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;
  let repo: DrizzleExtracaoOrcamentoRepository;
  const idsParaLimpar: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
    repo = new DrizzleExtracaoOrcamentoRepository(db);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    // `extracoes_orcamento_historico` é append-only (T012, trigger bloqueia
    // DELETE/UPDATE por linha) — a limpeza de teste desativa os triggers só
    // nesta sessão (`session_replication_role`), nunca em produção.
    await client.query("set session_replication_role = 'replica'");
    try {
      while (idsParaLimpar.length > 0) {
        const id = idsParaLimpar.pop()!;
        await client.query(
          'delete from extracao.extracoes_orcamento_historico where extracao_orcamento_id = $1',
          [id],
        );
        await client.query('delete from extracao.extracoes_orcamento where id = $1', [id]);
      }
    } finally {
      await client.query("set session_replication_role = 'origin'");
    }
  });

  it('buscarPorOrcamentoId retorna undefined para orcamentoId inexistente', async () => {
    await expect(repo.buscarPorOrcamentoId(orcamentoIdDeTeste())).resolves.toBeUndefined();
  });

  it('(issue #648) roundtrip do tenantId opcional — persiste e recarrega o mesmo valor', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());
    const tenantId = TenantId.de('01890a5d-ac96-774b-bcce-b302099a8057');

    const extracao = ExtracaoOrcamento.criar(
      id,
      referenciaClassificacao(),
      referenciaBruta('doc-tenant.pdf'),
      tenantId,
    );
    await repo.salvar(extracao);

    const carregado = await repo.buscarPorOrcamentoId(id);
    expect(carregado?.tenantId?.toString()).toBe(tenantId.toString());
  });

  it('(issue #648) tenantId ausente na criação é persistido e recarregado como undefined', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const extracao = ExtracaoOrcamento.criar(
      id,
      referenciaClassificacao(),
      referenciaBruta('doc-sem-tenant.pdf'),
    );
    await repo.salvar(extracao);

    const carregado = await repo.buscarPorOrcamentoId(id);
    expect(carregado?.tenantId).toBeUndefined();
  });

  it('salva PENDENTE e recarrega EXTRAIDO com itens/condições completos e 1 entrada de histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const extracao = ExtracaoOrcamento.criar(
      id,
      referenciaClassificacao(),
      referenciaBruta('doc-1.pdf'),
    );
    await repo.salvar(extracao);

    const pendente = await repo.buscarPorOrcamentoId(id);
    expect(pendente?.status).toBe('PENDENTE');

    pendente!.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());
    await repo.salvar(pendente!);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.status).toBe('EXTRAIDO');
    expect(final?.historico).toHaveLength(1);
    expect(final?.historico[0]?.agente).toBe('EXTRATOR');
    expect(final?.itens).toHaveLength(1);
    expect(final?.itens[0]?.descricao.valor?.descricao).toBe('Parafuso M6');
    expect(final?.itens[0]?.precoUnitario.valor?.valorCentavos).toBe(1050);
    expect(final?.condicoesComerciais?.condicoesPagamento.valor).toBe('30 dias');
    expect(final?.condicoesComerciais?.prazoValidade.valor?.paraPayload()).toBe(
      '2026-12-31T00:00:00.000Z',
    );
  });

  it('campo sem confiança escalona para PENDENTE_REVISAO_HUMANA; confirmação humana recarrega EXTRAIDO_COM_PENDENCIA_CONFIRMADA com 2 entradas de histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const extracao = ExtracaoOrcamento.criar(
      id,
      referenciaClassificacao(),
      referenciaBruta('doc-2.pdf'),
    );
    extracao.registrarTentativaExtrator([itemIncompleto()], condicoesCompletas());
    expect(extracao.status).toBe('PENDENTE_REVISAO_HUMANA');
    await repo.salvar(extracao);

    const pendenteRevisao = await repo.buscarPorOrcamentoId(id);
    expect(pendenteRevisao?.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(pendenteRevisao?.historico).toHaveLength(1);
    expect(pendenteRevisao?.itens[0]?.quantidade.extraido).toBe(false);

    pendenteRevisao!.registrarConfirmacaoHumana([itemIncompleto()], condicoesCompletas('HUMANO'));
    await repo.salvar(pendenteRevisao!);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.status).toBe('EXTRAIDO_COM_PENDENCIA_CONFIRMADA');
    expect(final?.historico).toHaveLength(2);
    expect(final?.historico[0]?.agente).toBe('EXTRATOR');
    expect(final?.historico[1]?.agente).toBe('HUMANO');
  });

  it('re-salvar o mesmo agregado sem transição nova não duplica histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const extracao = ExtracaoOrcamento.criar(
      id,
      referenciaClassificacao(),
      referenciaBruta('doc-3.pdf'),
    );
    extracao.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());
    await repo.salvar(extracao);

    const carregado = await repo.buscarPorOrcamentoId(id);
    await repo.salvar(carregado!); // nenhuma transição nova aplicada

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.historico).toHaveLength(1);
  });

  it('duas chamadas concorrentes de salvar() para o mesmo orcamentoId (retry) produzem exatamente 1 entrada de histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const clienteB = new Client({ connectionString: DATABASE_URL });
    await clienteB.connect();
    const repoB = new DrizzleExtracaoOrcamentoRepository(drizzle(clienteB));

    try {
      const agregadoA = ExtracaoOrcamento.criar(
        id,
        referenciaClassificacao(),
        referenciaBruta('doc-4.pdf'),
      );
      agregadoA.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());

      const agregadoB = ExtracaoOrcamento.criar(
        id,
        referenciaClassificacao(),
        referenciaBruta('doc-4.pdf'),
      );
      agregadoB.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());

      await Promise.all([repo.salvar(agregadoA), repoB.salvar(agregadoB)]);

      const linhasHistorico = await db
        .select()
        .from(extracoesOrcamentoHistorico)
        .where(eq(extracoesOrcamentoHistorico.extracaoOrcamentoId, id.toString()));
      expect(linhasHistorico).toHaveLength(1);

      const final = await repo.buscarPorOrcamentoId(id);
      expect(final?.status).toBe('EXTRAIDO');
      expect(final?.historico).toHaveLength(1);

      const linhaExtracao = await db
        .select()
        .from(extracoesOrcamento)
        .where(eq(extracoesOrcamento.id, id.toString()));
      expect(linhaExtracao).toHaveLength(1);
    } finally {
      await clienteB.end();
    }
  });
});
