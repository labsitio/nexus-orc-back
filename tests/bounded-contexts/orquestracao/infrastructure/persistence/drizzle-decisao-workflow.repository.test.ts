// Integration test: exercita `DrizzleDecisaoWorkflowRepository` (T016)
// contra um Postgres real já migrado (`pnpm db:migrate`), não um mock —
// prova a tradução linha↔agregado, o roundtrip do JSONB dos contextos/decisão
// e a serialização via `SELECT ... FOR UPDATE` (mesmo padrão de
// `DrizzleOrcamentoValidacaoRepository`, spec 003 T014).
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
import { DecisaoWorkflow } from '../../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import { ContextoClassificacao } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-classificacao.vo.js';
import { ContextoExtracao } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';
import { ContextoValidacao } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-validacao.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';
import { DrizzleDecisaoWorkflowRepository } from '../../../../../src/bounded-contexts/orquestracao/infrastructure/persistence/drizzle-decisao-workflow.repository.js';
import { decisoesWorkflowHistorico } from '../../../../../src/bounded-contexts/orquestracao/infrastructure/persistence/schema/decisao-workflow.schema.js';
import { TenantId } from '../../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** BC Orquestração nunca gera `OrcamentoId` (é sempre reutilizado da Ingestão) — gerado só para teste. */
function orcamentoIdDeTeste(): OrcamentoId {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const valor = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return OrcamentoId.de(valor);
}

const contextoClassificacao = ContextoClassificacao.de({
  fornecedorIdentificado: 'Fornecedor XPTO',
  formatoIdentificado: 'PDF',
});
const contextoExtracao = ContextoExtracao.de({
  itensResumo: '3 itens de ferramentas',
  condicoesComerciaisResumo: '30 dias',
  houvePendenciaConfirmada: false,
});
const contextoValidacao = ContextoValidacao.de({ resultado: 'VALIDADO' });

function decisaoConsolidada(id: OrcamentoId): DecisaoWorkflow {
  const decisao = DecisaoWorkflow.criar(id);
  decisao.registrarContextoClassificacao(contextoClassificacao);
  decisao.registrarContextoExtracao(contextoExtracao);
  decisao.registrarContextoValidacao(contextoValidacao);
  decisao.consolidarContexto();
  return decisao;
}

// `salvar` abre sua própria transação (lock + insert) — cada teste gera seu
// próprio `OrcamentoId` e limpa explicitamente as linhas que criou.
describe.skipIf(!DATABASE_URL)('DrizzleDecisaoWorkflowRepository (Postgres real)', () => {
  let client: Client;
  let db: NodePgDatabase;
  let repo: DrizzleDecisaoWorkflowRepository;
  const idsParaLimpar: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    db = drizzle(client);
    repo = new DrizzleDecisaoWorkflowRepository(db);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    // `decisoes_workflow_historico` é append-only (T015, trigger bloqueia
    // DELETE/UPDATE por linha) — a limpeza de teste desativa os triggers só
    // nesta sessão (`session_replication_role`), nunca em produção.
    await client.query("set session_replication_role = 'replica'");
    try {
      while (idsParaLimpar.length > 0) {
        const id = idsParaLimpar.pop()!;
        await client.query(
          'delete from orquestracao.decisoes_workflow_historico where decisao_workflow_id = $1',
          [id],
        );
        await client.query('delete from orquestracao.decisoes_workflow where id = $1', [id]);
      }
    } finally {
      await client.query("set session_replication_role = 'origin'");
    }
  });

  it('buscarPorOrcamentoId retorna undefined para orcamentoId inexistente', async () => {
    await expect(repo.buscarPorOrcamentoId(orcamentoIdDeTeste())).resolves.toBeUndefined();
  });

  it('salva AGUARDANDO_CONTEXTO e recarrega CONTEXTO_CONSOLIDADO com os 3 contextos', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const decisao = DecisaoWorkflow.criar(id);
    await repo.salvar(decisao);

    const aguardando = await repo.buscarPorOrcamentoId(id);
    expect(aguardando?.status).toBe('AGUARDANDO_CONTEXTO');

    aguardando!.registrarContextoClassificacao(contextoClassificacao);
    aguardando!.registrarContextoExtracao(contextoExtracao);
    aguardando!.registrarContextoValidacao(contextoValidacao);
    aguardando!.consolidarContexto();
    await repo.salvar(aguardando!);

    const consolidado = await repo.buscarPorOrcamentoId(id);
    expect(consolidado?.status).toBe('CONTEXTO_CONSOLIDADO');
    expect(consolidado?.contextoClassificacao?.fornecedorIdentificado).toBe('Fornecedor XPTO');
    expect(consolidado?.contextoExtracao?.itensResumo).toBe('3 itens de ferramentas');
    expect(consolidado?.contextoValidacao?.resultado).toBe('VALIDADO');
  });

  it('confiança suficiente decide DECIDIDO e recarrega decisaoAtual + histórico com 1 entrada', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const decisao = decisaoConsolidada(id);
    decisao.registrarTentativaOrquestrador({
      acao: 'APROVAR',
      nivelConfianca: NivelConfianca.de(90),
      criterio: 'Preço e itens condizem com o histórico do fornecedor',
      requerIntegracaoExterna: false,
    });
    await repo.salvar(decisao);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.status).toBe('DECIDIDO');
    expect(final?.decisaoAtual?.acao).toBe('APROVAR');
    expect(final?.decisaoAtual?.nivelConfianca?.valor).toBe(90);
    expect(final?.decisaoAtual?.agenteOrigem).toBe('ORQUESTRADOR');
    expect(final?.historico).toHaveLength(1);
    expect(final?.historico[0]?.resultado?.acao).toBe('APROVAR');
  });

  it('confiança insuficiente escalona para PENDENTE_REVISAO_HUMANA; decisão humana recarrega DECIDIDO com 2 entradas de histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const decisao = decisaoConsolidada(id);
    decisao.registrarTentativaOrquestrador({
      acao: 'APROVAR',
      nivelConfianca: NivelConfianca.de(50),
      criterio: 'confiança insuficiente',
      requerIntegracaoExterna: false,
    });
    await repo.salvar(decisao);

    const pendente = await repo.buscarPorOrcamentoId(id);
    expect(pendente?.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(pendente?.historico).toHaveLength(1);
    expect(pendente?.historico[0]?.motivoInsucesso).toContain('abaixo do limiar');
    expect(pendente?.decisaoAtual).toBeUndefined();

    pendente!.registrarDecisaoHumana({
      acao: 'ENCAMINHAR_COMPRADOR',
      criterio: 'comprador confirmou manualmente',
      requerIntegracaoExterna: false,
    });
    await repo.salvar(pendente!);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.status).toBe('DECIDIDO');
    expect(final?.decisaoAtual?.agenteOrigem).toBe('HUMANO');
    expect(final?.historico).toHaveLength(2);
    expect(final?.historico[1]?.resultado?.agenteOrigem).toBe('HUMANO');
  });

  it('re-salvar o mesmo agregado sem transição nova não duplica histórico', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const decisao = decisaoConsolidada(id);
    decisao.registrarTentativaOrquestrador({
      acao: 'APROVAR',
      nivelConfianca: NivelConfianca.de(90),
      criterio: 'critério auditável',
      requerIntegracaoExterna: false,
    });
    await repo.salvar(decisao);

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
    const repoB = new DrizzleDecisaoWorkflowRepository(drizzle(clienteB));

    try {
      const decisaoA = decisaoConsolidada(id);
      decisaoA.registrarTentativaOrquestrador({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'critério auditável',
        requerIntegracaoExterna: false,
      });

      const decisaoB = decisaoConsolidada(id);
      decisaoB.registrarTentativaOrquestrador({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'critério auditável',
        requerIntegracaoExterna: false,
      });

      await Promise.all([repo.salvar(decisaoA), repoB.salvar(decisaoB)]);

      const linhasHistorico = await db
        .select()
        .from(decisoesWorkflowHistorico)
        .where(eq(decisoesWorkflowHistorico.decisaoWorkflowId, id.toString()));
      expect(linhasHistorico).toHaveLength(1);

      const final = await repo.buscarPorOrcamentoId(id);
      expect(final?.status).toBe('DECIDIDO');
      expect(final?.historico).toHaveLength(1);
    } finally {
      await clienteB.end();
    }
  });

  it('(issue #650) tenantId ausente no primeiro save é persistido e recarregado quando um upstream posterior o traz', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());
    const tenantId = TenantId.de('01890a5d-ac96-774b-bcce-b302099a8057');

    const decisao = DecisaoWorkflow.criar(id);
    decisao.registrarContextoClassificacao(contextoClassificacao); // sem tenantId
    await repo.salvar(decisao);

    const aguardando = await repo.buscarPorOrcamentoId(id);
    expect(aguardando?.tenantId).toBeUndefined();

    aguardando!.registrarContextoValidacao(contextoValidacao, tenantId);
    await repo.salvar(aguardando!);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.tenantId?.toString()).toBe(tenantId.toString());
  });

  it('(issue #650) tenantId ausente em todos os 3 upstreams é persistido e recarregado como undefined', async () => {
    const id = orcamentoIdDeTeste();
    idsParaLimpar.push(id.toString());

    const decisao = decisaoConsolidada(id);
    await repo.salvar(decisao);

    const final = await repo.buscarPorOrcamentoId(id);
    expect(final?.tenantId).toBeUndefined();
  });
});
