// Integration test: exercita `DrizzleOrcamentoValidacaoRepository` (T014)
// contra um Postgres real já migrado (`pnpm db:migrate`), não um mock —
// prova a tradução linha↔agregado, o roundtrip do JSONB de
// dadosExtraidos/inconsistencias e a serialização via `SELECT ... FOR UPDATE`
// (mesmo padrão de `DrizzleExtracaoOrcamentoRepository`, spec 002 T013).
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
import { InconsistenciaDetectada } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import { OrcamentoValidacao } from '../../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import { DadosExtraidosParaValidacao } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { ItemParaValidacao } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import { DrizzleOrcamentoValidacaoRepository } from '../../../../../src/bounded-contexts/validacao/infrastructure/persistence/drizzle-orcamento-validacao.repository.js';
import { validacoesOrcamentoHistorico } from '../../../../../src/bounded-contexts/validacao/infrastructure/persistence/schema/validacao-orcamento.schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** BC Validação nunca gera `OrcamentoId` (é sempre reutilizado da Ingestão) — gerado só para teste. */
function orcamentoIdDeTeste(): OrcamentoId {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const valor = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return OrcamentoId.de(valor);
}

function dadosExtraidosDeTeste(cnpjFornecedor = '11222333000181'): DadosExtraidosParaValidacao {
  return DadosExtraidosParaValidacao.de({
    cnpjFornecedor,
    itens: [
      ItemParaValidacao.de({
        descricao: 'Item de teste',
        quantidade: 1,
        precoUnitario: Dinheiro.de(1000, 'BRL'),
        extraido: true,
      }),
    ],
    condicoesComerciais: 'à vista',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
  });
}

// `salvar` abre sua própria transação (lock + insert) — cada teste gera seu
// próprio `OrcamentoId` e limpa explicitamente as linhas que criou.
describe.skipIf(!DATABASE_URL)('DrizzleOrcamentoValidacaoRepository (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;
  let repo: DrizzleOrcamentoValidacaoRepository;
  const idsParaLimpar: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
    repo = new DrizzleOrcamentoValidacaoRepository(db);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    // `validacoes_orcamento_historico` é append-only (T013, trigger bloqueia
    // DELETE/UPDATE por linha) — a limpeza de teste desativa os triggers só
    // nesta sessão (`session_replication_role`), nunca em produção.
    await client.query("set session_replication_role = 'replica'");
    try {
      while (idsParaLimpar.length > 0) {
        const id = idsParaLimpar.pop()!;
        await client.query(
          'delete from validacao.validacoes_orcamento_historico where orcamento_validacao_id = $1',
          [id],
        );
        await client.query('delete from validacao.validacoes_orcamento where id = $1', [id]);
      }
    } finally {
      await client.query("set session_replication_role = 'origin'");
    }
  });

  it('buscarPorOrcamentoId retorna undefined para orcamentoId inexistente', async () => {
    await expect(repo.buscarPorOrcamentoId(orcamentoIdDeTeste())).resolves.toBeUndefined();
  });

  it('salva PENDENTE e recarrega VALIDADO com 1 entrada de histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const agregado = OrcamentoValidacao.criar(id, dadosExtraidosDeTeste());
    await repo.salvar(agregado);

    const pendente = await repo.buscarPorOrcamentoId(id);
    expect(pendente?.status).toBe('PENDENTE');
    expect(pendente?.dadosExtraidos.cnpjFornecedor).toBe('11222333000181');
    expect(pendente?.dadosExtraidos.itens[0]?.descricao).toBe('Item de teste');

    pendente!.avaliarRegrasDeConsistencia([]);
    await repo.salvar(pendente!);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.status).toBe('VALIDADO');
    expect(final?.historico).toHaveLength(1);
    expect(final?.historico[0]?.resultado).toBe('VALIDADO');
  });

  it('inconsistência escalona para PENDENTE_REVISAO_HUMANA; ACEITE_COM_RESSALVA recarrega VALIDADO_COM_RESSALVA com 2 entradas de histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const agregado = OrcamentoValidacao.criar(id, dadosExtraidosDeTeste('11222333000180'));
    const inconsistencia = InconsistenciaDetectada.de(
      'CNPJ_INVALIDO',
      'dígito verificador incorreto',
    );
    agregado.avaliarRegrasDeConsistencia([inconsistencia]);
    await repo.salvar(agregado);

    const pendenteRevisao = await repo.buscarPorOrcamentoId(id);
    expect(pendenteRevisao?.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(pendenteRevisao?.historico).toHaveLength(1);
    expect(pendenteRevisao?.inconsistencias).toHaveLength(1);
    expect(pendenteRevisao?.inconsistencias[0]?.regra).toBe('CNPJ_INVALIDO');

    pendenteRevisao!.registrarDecisaoHumana({ tipo: 'ACEITE_COM_RESSALVA' });
    await repo.salvar(pendenteRevisao!);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.status).toBe('VALIDADO_COM_RESSALVA');
    expect(final?.historico).toHaveLength(2);
    expect(final?.historico[1]?.resultado).toBe('ACEITE_COM_RESSALVA');
    expect(final?.inconsistencias).toHaveLength(1);
  });

  it('re-salvar o mesmo agregado sem transição nova não duplica histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const agregado = OrcamentoValidacao.criar(id, dadosExtraidosDeTeste());
    agregado.avaliarRegrasDeConsistencia([]);
    await repo.salvar(agregado);

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
    const repoB = new DrizzleOrcamentoValidacaoRepository(drizzle(clienteB));

    try {
      const agregadoA = OrcamentoValidacao.criar(id, dadosExtraidosDeTeste());
      agregadoA.avaliarRegrasDeConsistencia([]);

      const agregadoB = OrcamentoValidacao.criar(id, dadosExtraidosDeTeste());
      agregadoB.avaliarRegrasDeConsistencia([]);

      await Promise.all([repo.salvar(agregadoA), repoB.salvar(agregadoB)]);

      const linhasHistorico = await db
        .select()
        .from(validacoesOrcamentoHistorico)
        .where(eq(validacoesOrcamentoHistorico.orcamentoValidacaoId, id.toString()));
      expect(linhasHistorico).toHaveLength(1);

      const final = await repo.buscarPorOrcamentoId(id);
      expect(final?.status).toBe('VALIDADO');
      expect(final?.historico).toHaveLength(1);
    } finally {
      await clienteB.end();
    }
  });
});
