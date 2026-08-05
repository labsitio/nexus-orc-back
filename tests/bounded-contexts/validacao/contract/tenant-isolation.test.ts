import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ConsultarStatusValidacao } from '../../../../src/bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import { RegistrarDecisaoHumanaValidacao } from '../../../../src/bounded-contexts/validacao/application/use-cases/registrar-decisao-humana-validacao.js';
import { OrcamentoValidacao } from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import type { OrcamentoValidacaoRepository } from '../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { InconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/validacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/validacao/domain/events/domain-event.js';
import { registrarRotaStatusValidacao } from '../../../../src/bounded-contexts/validacao/interface/http/status.controller.js';
import { registrarRotaDecisaoHumanaValidacao } from '../../../../src/bounded-contexts/validacao/interface/http/decisao-humana.controller.js';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Teste de contrato (issue #656, spec 007): `GET .../validacao/status` e
 * `POST .../validacao/decisao-humana` com tenantContext de Tenant A e
 * orcamentoId pertencente a Tenant B MUST retornar 404 — nunca 200 (leak de
 * dado) nem 403 (confirmaria a existência do recurso em outro tenant). Mesmo
 * padrão de `ingestao-identificacao/contract/tenant-isolation.test.ts` (T011).
 */

class OrcamentoValidacaoRepositoryFake implements OrcamentoValidacaoRepository {
  private readonly registros = new Map<string, OrcamentoValidacao>();

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    this.registros.set(orcamentoValidacao.orcamentoId.toString(), orcamentoValidacao);
  }

  async buscarPorOrcamentoId(id: OrcamentoId): Promise<OrcamentoValidacao | undefined> {
    return this.registros.get(id.toString());
  }
}

class EventPublisherFake implements EventPublisher {
  publicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.publicados.push(evento);
  }
}

function criarPreHandlerFakeTenant(tenantId: TenantId): preHandlerHookHandler {
  return async (request) => {
    request.tenantContext = criarTenantContext(tenantId);
  };
}

function dadosExtraidos(): DadosExtraidosParaValidacao {
  return DadosExtraidosParaValidacao.de({
    cnpjFornecedor: '11222333000181',
    itens: [
      ItemParaValidacao.de({
        descricao: 'Item',
        quantidade: 1,
        precoUnitario: Dinheiro.de(1000, 'BRL'),
        extraido: false,
      }),
    ],
    condicoesComerciais: 'à vista',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
  });
}

function validacaoPendenteRevisao(id: OrcamentoId, tenantId: TenantId): OrcamentoValidacao {
  const validacao = OrcamentoValidacao.criar(id, dadosExtraidos(), tenantId);
  validacao.avaliarRegrasDeConsistencia([
    InconsistenciaDetectada.de('PRAZO_INCOERENTE', 'prazo incoerente'),
  ]);
  return validacao;
}

describe('Isolamento multitenant — BC Validação (issue #656)', () => {
  it('GET .../validacao/status: tenantContext de Tenant A + orcamentoId de Tenant B retorna 404, nunca 200/403', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const idDeTenantB = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');
    await repositorio.salvar(OrcamentoValidacao.criar(idDeTenantB, dadosExtraidos(), tenantB));

    const app = Fastify();
    registrarRotaStatusValidacao(app, new ConsultarStatusValidacao(() => repositorio), {
      preHandler: criarPreHandlerFakeTenant(tenantA),
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idDeTenantB.toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.statusCode).not.toBe(403);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });

  it('POST .../validacao/decisao-humana: tenantContext de Tenant A + orcamentoId de Tenant B retorna 404, nunca 200/403', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const idDeTenantB = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a2');
    await repositorio.salvar(validacaoPendenteRevisao(idDeTenantB, tenantB));

    const app = Fastify();
    registrarRotaDecisaoHumanaValidacao(
      app,
      new RegistrarDecisaoHumanaValidacao(() => repositorio, new EventPublisherFake()),
      new ConsultarStatusValidacao(() => repositorio),
      { preHandler: criarPreHandlerFakeTenant(tenantA) },
    );

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${idDeTenantB.toString()}/validacao/decisao-humana`,
      payload: { decisao: 'ACEITE_COM_RESSALVA', justificativa: 'irrelevante' },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.statusCode).not.toBe(403);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });

  it('mesmo tenant (Tenant A consultando o próprio orcamentoId) continua funcionando (200)', async () => {
    const tenantA = TenantId.novo();
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const idDeTenantA = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a3');
    await repositorio.salvar(OrcamentoValidacao.criar(idDeTenantA, dadosExtraidos(), tenantA));

    const app = Fastify();
    registrarRotaStatusValidacao(app, new ConsultarStatusValidacao(() => repositorio), {
      preHandler: criarPreHandlerFakeTenant(tenantA),
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idDeTenantA.toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ orcamentoId: idDeTenantA.toString() });
    await app.close();
  });

  it('sem tenantContext (middleware não populou), retorna 401 antes de alcançar o repositório', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const app = Fastify();
    registrarRotaStatusValidacao(app, new ConsultarStatusValidacao(() => repositorio));

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a4').toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });
});
