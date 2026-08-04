// T025 (#185) — Integration test: `OrcamentoValidado` publicado →
// `OrcamentoIndexado` publicado, embedding persistido em
// `indices_orcamento`, p95 medido em ambiente de teste local (LocalStack +
// Postgres/pgvector).
//
// Exercita a orquestração real de produção — `OrcamentoValidadoEventACL`
// (T014/T018) + `IndexarOrcamento` (T029) + `DrizzlePgvectorIndiceOrcamento
// Repository` (T016) contra Postgres real com `pgvector` — nunca uma
// reimplementação da orquestração no teste (diferente do padrão de T021/spec
// 003, ali necessário porque `ValidarOrcamento` ainda não existia; aqui já
// existe, ver #189).
//
// `AgenteEmbeddingGateway` (Bedrock) e `EventPublisher` (EventBridge) seguem
// fake — cada um já tem suíte de integração própria e dedicada
// (`bedrock-embedding.gateway.test.ts`, `eventbridge.publisher.test.ts`);
// aqui o alvo é a orquestração + persistência real, não a rede AWS.
//
// GATE (#190/ADR-008): o handler Lambda consumidor de `indexador-queue`
// (T030) que chamaria `IndexarOrcamento.executar` em produção ainda não
// existe — spec-007 T042 (mergeada) apenas fez `OrcamentoValidadoEventACL`
// extrair/validar `tenantId` do envelope de 003 no seu resultado; nenhum
// caller de produção decide ainda daí para `executar`. Este teste não
// implementa esse handler: fornece `tenantId` diretamente ao caso de uso, do
// mesmo modo que o unit test de T029 (`indexar-orcamento.test.ts`) já faz —
// é o próprio contrato de
// `IndexarOrcamento.executar(tenantId, detailType, payloadBruto)` hoje,
// nenhum contrato novo inventado. `payloadOrcamentoValidadoDeTeste` inclui
// `tenantId` porque a ACL real (não fake) agora rejeita payload sem ele.
//
// Requer DATABASE_URL (ver .env.example / docker-compose.yml, serviço
// `postgres`) apontando para um banco já migrado. Sem DATABASE_URL, a suíte
// é pulada (não falha) — CI provisiona o serviço e migra antes de rodar os
// testes (.github/workflows/ci.yml), mesmo padrão de
// `drizzle-pgvector-indice-orcamento.repository.test.ts`.
import { randomBytes } from 'node:crypto';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { IndexarOrcamento } from '../../../../src/bounded-contexts/busca-indexacao/application/use-cases/indexar-orcamento.js';
import type { AgenteEmbeddingGateway } from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/agente-embedding.gateway.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/event-publisher.js';
import { OrcamentoValidadoEventACL } from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/orcamento-validado-event.acl.js';
import { DrizzlePgvectorIndiceOrcamentoRepository } from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/persistence/drizzle-pgvector-indice-orcamento.repository.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/busca-indexacao/domain/events/domain-event.js';
import { OrcamentoIndexado } from '../../../../src/bounded-contexts/busca-indexacao/domain/events/orcamento-indexado.event.js';
import { Embedding } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import type { Embedding as EmbeddingVO } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_ID = TenantId.de('00000000-0000-7000-8000-0000000000cc');

/** BC Busca & Indexação nunca gera `OrcamentoId` (sempre reutilizado da Ingestão) — só para teste. */
function orcamentoIdDeTeste(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function payloadOrcamentoValidadoDeTeste(orcamentoId: string) {
  return {
    orcamentoId,
    tenantId: TENANT_ID.toString(),
    itens: [
      {
        descricao: 'Notebook 15 polegadas',
        quantidade: 10,
        precoUnitario: { valorCentavos: 350000, moeda: 'BRL' },
        // Categoria exclusiva deste arquivo — evita colisão com o filtro
        // `categoria: 'informatica'` (limit 10) de
        // drizzle-pgvector-indice-orcamento.repository.test.ts sob execução
        // concorrente de suíte (vitest roda arquivos em paralelo).
        categoria: 'indexacao-t025-fixture',
        extraido: true,
      },
    ],
    condicoesComerciais: '30 dias, à vista',
  };
}

class EmbeddingGatewayFake implements AgenteEmbeddingGateway {
  async gerarEmbedding(_texto: string): Promise<EmbeddingVO> {
    return Embedding.de({
      vetor: new Array(1024).fill(0.1),
      dimensao: 1024,
      modeloId: 'amazon.titan-embed-text-v2:0',
      geradoEm: new Date(),
    });
  }
}

class EventPublisherFake implements EventPublisher {
  readonly eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

describe.skipIf(!DATABASE_URL)(
  'Consumidor de indexador-queue (integração real: ACL + IndexarOrcamento + Postgres/pgvector)',
  () => {
    let client: Client;
    let db: NodePgDatabase;
    let repositorio: DrizzlePgvectorIndiceOrcamentoRepository;
    const idsParaLimpar: string[] = [];

    beforeAll(async () => {
      client = new Client({ connectionString: DATABASE_URL });
      await client.connect();
      db = drizzle(client);
      repositorio = new DrizzlePgvectorIndiceOrcamentoRepository(db, criarTenantContext(TENANT_ID));
    });

    afterAll(async () => {
      await client.end();
    });

    afterEach(async () => {
      // `indices_orcamento_historico` é append-only (trigger bloqueia
      // DELETE/UPDATE por linha) — limpeza de teste desativa o trigger só
      // nesta sessão, mesmo padrão de drizzle-pgvector-indice-orcamento.repository.test.ts.
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

    it('publica OrcamentoIndexado e persiste embedding em indices_orcamento com tenant_id correto', async () => {
      const orcamentoId = orcamentoIdDeTeste();
      idsParaLimpar.push(orcamentoId);
      const publisher = new EventPublisherFake();
      const useCase = new IndexarOrcamento(
        new OrcamentoValidadoEventACL(),
        new EmbeddingGatewayFake(),
        repositorio,
        publisher,
      );

      await useCase.executar(
        TENANT_ID,
        'OrcamentoValidado',
        payloadOrcamentoValidadoDeTeste(orcamentoId),
      );

      expect(publisher.eventosPublicados).toHaveLength(1);
      const evento = publisher.eventosPublicados[0] as OrcamentoIndexado;
      expect(evento).toBeInstanceOf(OrcamentoIndexado);
      expect(evento.orcamentoId).toBe(orcamentoId);
      expect(evento.tenantId).toBe(TENANT_ID.toString());
      expect(evento.modeloEmbedding).toBe('amazon.titan-embed-text-v2:0');

      const linha = await client.query<{ estado: string; embedding: string; tenant_id: string }>(
        'select estado, embedding, tenant_id from busca_indexacao.indices_orcamento where id = $1',
        [orcamentoId],
      );
      expect(linha.rows).toHaveLength(1);
      expect(linha.rows[0]?.estado).toBe('INDEXADO');
      expect(linha.rows[0]?.embedding).not.toBeNull();
      expect(linha.rows[0]?.tenant_id).toBe(TENANT_ID.toString());
    });

    it('p95 da orquestração real (20 execuções, Postgres/pgvector local) fica muito abaixo da meta de 5 minutos (spec.md)', async () => {
      const META_P95_MS = 5 * 60 * 1000;
      const duracoes: number[] = [];

      for (let i = 0; i < 20; i++) {
        const orcamentoId = orcamentoIdDeTeste();
        idsParaLimpar.push(orcamentoId);
        const publisher = new EventPublisherFake();
        const useCase = new IndexarOrcamento(
          new OrcamentoValidadoEventACL(),
          new EmbeddingGatewayFake(),
          repositorio,
          publisher,
        );

        const inicio = performance.now();
        await useCase.executar(
          TENANT_ID,
          'OrcamentoValidado',
          payloadOrcamentoValidadoDeTeste(orcamentoId),
        );
        duracoes.push(performance.now() - inicio);
      }

      duracoes.sort((a, b) => a - b);
      const indiceP95 = Math.ceil(0.95 * duracoes.length) - 1;
      const p95 = duracoes[indiceP95]!;

      // ponytail: p95 aqui é da orquestração + Postgres real local (proxy de
      // ambiente de teste exigido por T025) — AgenteEmbeddingGateway/EventPublisher
      // seguem fake (Bedrock/EventBridge reais são suíte própria); medição
      // ponta a ponta via LocalStack SQS/EventBridge real fica para o Polish
      // pós-T030 (handler Lambda, hoje bloqueado por #190/ADR-008).
      expect(p95).toBeLessThan(META_P95_MS);
    });
  },
);
