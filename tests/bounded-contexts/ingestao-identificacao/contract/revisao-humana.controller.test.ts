import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfirmarRevisaoHumana } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/confirmar-revisao-humana.js';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { ResultadoClassificacao } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { registrarRotaRevisaoHumana } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/revisao-humana.controller.js';

class OrcamentoRepositoryFake implements OrcamentoRepository {
  private readonly registros = new Map<string, Orcamento>();
  async salvar(orcamento: Orcamento): Promise<void> {
    this.registros.set(orcamento.id.toString(), orcamento);
  }
  async buscarPorId(id: OrcamentoId): Promise<Orcamento | undefined> {
    return this.registros.get(id.toString());
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

function criarReferenciaBruta(): ReferenciaS3 {
  return ReferenciaS3.de({
    bucket: 'nexo-orcamentos-raw',
    key: 'portal-web/2026/07/30/orcamento.pdf',
    versionId: 'v1',
  });
}

function criarPreHandlerFakeTenant(tenantId: TenantId): preHandlerHookHandler {
  return async (request) => {
    request.tenantContext = criarTenantContext(tenantId);
  };
}

describe('POST /v1/orcamentos/{orcamentoId}/revisao-humana — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: OrcamentoRepositoryFake;
  let publisher: EventPublisherFake;
  let tenantIdTeste: TenantId;

  beforeEach(() => {
    repositorio = new OrcamentoRepositoryFake();
    publisher = new EventPublisherFake();
    tenantIdTeste = TenantId.novo();
    app = Fastify();
    registrarRotaRevisaoHumana(app, new ConfirmarRevisaoHumana(repositorio, publisher), {
      preHandler: criarPreHandlerFakeTenant(tenantIdTeste),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 confirma revisão humana de orçamento PENDENTE_REVISAO_HUMANA', async () => {
    const id = OrcamentoId.novo();
    const orcamento = Orcamento.receber({
      id,
      canal: Canal.de('PORTAL_WEB'),
      referenciaBruta: criarReferenciaBruta(),
      tenantId: tenantIdTeste,
    });
    orcamento.registrarTentativaClassificador(
      ResultadoClassificacao.criar({
        fornecedorIdentificado: 'Incerto',
        formatoIdentificado: 'XLSX',
        nivelConfianca: NivelConfianca.de(40),
        agenteOrigem: 'CLASSIFICADOR',
      }),
    );
    await repositorio.salvar(orcamento);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/revisao-humana`,
      payload: { fornecedorIdentificado: 'Distribuidora ABC Ltda', formatoIdentificado: 'PDF' },
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('CLASSIFICADO');
    expect(corpo.resultadoAtual).toMatchObject({
      fornecedorIdentificado: 'Distribuidora ABC Ltda',
      agenteOrigem: 'HUMANO',
      nivelConfianca: 100,
    });
    expect(publisher.eventosPublicados).toHaveLength(1);
  });

  it('409 Problem Details quando orçamento não está PENDENTE_REVISAO_HUMANA', async () => {
    const id = OrcamentoId.novo();
    await repositorio.salvar(
      Orcamento.receber({
        id,
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
        tenantId: tenantIdTeste,
      }),
    );

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/revisao-humana`,
      payload: { fornecedorIdentificado: 'X', formatoIdentificado: 'PDF' },
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('404 Problem Details para orcamentoId inexistente', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${OrcamentoId.novo().toString()}/revisao-humana`,
      payload: { fornecedorIdentificado: 'X', formatoIdentificado: 'PDF' },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details para body inválido (fornecedorIdentificado ausente)', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${OrcamentoId.novo().toString()}/revisao-humana`,
      payload: { formatoIdentificado: 'PDF' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details para orcamentoId mal formado', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/nao-e-uuid/revisao-humana',
      payload: { fornecedorIdentificado: 'X', formatoIdentificado: 'PDF' },
    });

    expect(resposta.statusCode).toBe(400);
  });
});
