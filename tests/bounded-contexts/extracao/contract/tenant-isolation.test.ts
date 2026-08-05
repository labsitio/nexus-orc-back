import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ConsultarStatusExtracao } from '../../../../src/bounded-contexts/extracao/application/use-cases/consultar-status-extracao.js';
import { ConfirmarRevisaoHumanaExtracao } from '../../../../src/bounded-contexts/extracao/application/use-cases/confirmar-revisao-humana-extracao.js';
import { ExtracaoOrcamento } from '../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
import type { ExtracaoOrcamentoRepository } from '../../../../src/bounded-contexts/extracao/domain/repositories/extracao-orcamento.repository.js';
import { CampoExtraido } from '../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../../../../src/bounded-contexts/extracao/domain/value-objects/condicoes-comerciais.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/extracao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaClassificacao } from '../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-classificacao.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-s3.vo.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/extracao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/extracao/domain/events/domain-event.js';
import { registrarRotaStatusExtracao } from '../../../../src/bounded-contexts/extracao/interface/http/status.controller.js';
import { registrarRotaRevisaoHumanaExtracao } from '../../../../src/bounded-contexts/extracao/interface/http/revisao-humana.controller.js';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Teste de contrato (issue #656, spec 007): `GET .../extracao/status` e
 * `POST .../extracao/revisao-humana` com tenantContext de Tenant A e
 * orcamentoId pertencente a Tenant B MUST retornar 404 — nunca 200 (leak de
 * dado) nem 403 (confirmaria a existência do recurso em outro tenant). Mesmo
 * padrão de `ingestao-identificacao/contract/tenant-isolation.test.ts` (T011).
 */

class ExtracaoOrcamentoRepositoryFake implements ExtracaoOrcamentoRepository {
  private readonly registros = new Map<string, ExtracaoOrcamento>();

  async salvar(extracao: ExtracaoOrcamento): Promise<void> {
    this.registros.set(extracao.orcamentoId.toString(), extracao);
  }

  async buscarPorOrcamentoId(id: OrcamentoId): Promise<ExtracaoOrcamento | undefined> {
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

function extracaoPendenteRevisao(id: OrcamentoId, tenantId: TenantId): ExtracaoOrcamento {
  const extracao = ExtracaoOrcamento.criar(
    id,
    ReferenciaClassificacao.de({
      fornecedorIdentificado: 'Fornecedor X',
      formatoIdentificado: 'PDF',
      agenteOrigem: 'CLASSIFICADOR',
    }),
    ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
    tenantId,
  );
  const confianca = NivelConfianca.de(20);
  extracao.registrarTentativaExtrator(
    [],
    CondicoesComerciais.de({
      condicoesPagamento: CampoExtraido.naoExtraido(confianca, 'EXTRATOR'),
      prazoValidade: CampoExtraido.naoExtraido(confianca, 'EXTRATOR'),
      condicoesEntrega: CampoExtraido.naoExtraido(confianca, 'EXTRATOR'),
    }),
  );
  return extracao;
}

describe('Isolamento multitenant — BC Extração (issue #656)', () => {
  it('GET .../extracao/status: tenantContext de Tenant A + orcamentoId de Tenant B retorna 404, nunca 200/403', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new ExtracaoOrcamentoRepositoryFake();
    const idDeTenantB = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');
    await repositorio.salvar(
      ExtracaoOrcamento.criar(
        idDeTenantB,
        ReferenciaClassificacao.de({
          fornecedorIdentificado: 'Fornecedor X',
          formatoIdentificado: 'PDF',
          agenteOrigem: 'CLASSIFICADOR',
        }),
        ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
        tenantB,
      ),
    );

    const app = Fastify();
    registrarRotaStatusExtracao(app, new ConsultarStatusExtracao(() => repositorio), {
      preHandler: criarPreHandlerFakeTenant(tenantA),
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idDeTenantB.toString()}/extracao/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.statusCode).not.toBe(403);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });

  it('POST .../extracao/revisao-humana: tenantContext de Tenant A + orcamentoId de Tenant B retorna 404, nunca 200/403', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new ExtracaoOrcamentoRepositoryFake();
    const idDeTenantB = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8058');
    await repositorio.salvar(extracaoPendenteRevisao(idDeTenantB, tenantB));

    const app = Fastify();
    registrarRotaRevisaoHumanaExtracao(
      app,
      new ConfirmarRevisaoHumanaExtracao(() => repositorio, new EventPublisherFake()),
      { preHandler: criarPreHandlerFakeTenant(tenantA) },
    );

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${idDeTenantB.toString()}/extracao/revisao-humana`,
      payload: {
        camposConfirmados: [
          { caminho: 'condicoesComerciais.prazoValidade', valor: null, indisponivel: true },
        ],
      },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.statusCode).not.toBe(403);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });

  it('mesmo tenant (Tenant A consultando o próprio orcamentoId) continua funcionando (200)', async () => {
    const tenantA = TenantId.novo();
    const repositorio = new ExtracaoOrcamentoRepositoryFake();
    const idDeTenantA = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8059');
    await repositorio.salvar(
      ExtracaoOrcamento.criar(
        idDeTenantA,
        ReferenciaClassificacao.de({
          fornecedorIdentificado: 'Fornecedor X',
          formatoIdentificado: 'PDF',
          agenteOrigem: 'CLASSIFICADOR',
        }),
        ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
        tenantA,
      ),
    );

    const app = Fastify();
    registrarRotaStatusExtracao(app, new ConsultarStatusExtracao(() => repositorio), {
      preHandler: criarPreHandlerFakeTenant(tenantA),
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idDeTenantA.toString()}/extracao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ orcamentoId: idDeTenantA.toString() });
    await app.close();
  });

  it('sem tenantContext (middleware não populou), retorna 401 antes de alcançar o repositório', async () => {
    const repositorio = new ExtracaoOrcamentoRepositoryFake();
    const app = Fastify();
    registrarRotaStatusExtracao(app, new ConsultarStatusExtracao(() => repositorio));

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a805a').toString()}/extracao/status`,
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });
});
