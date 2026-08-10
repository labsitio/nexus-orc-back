import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarTenantContextMiddleware } from '../../../src/interface/shared/tenant-context.middleware.js';
import { TenantId } from '../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { registrarRotaDecisaoHumanaWorkflow } from '../../../src/bounded-contexts/orquestracao/interface/http/decisao-humana.controller.js';
import { ConsultarStatusDecisaoWorkflow } from '../../../src/bounded-contexts/orquestracao/application/use-cases/consultar-status-decisao-workflow.js';
import { RegistrarDecisaoHumanaWorkflow } from '../../../src/bounded-contexts/orquestracao/application/use-cases/registrar-decisao-humana-workflow.js';
import { DecisaoWorkflow } from '../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import type { EventPublisher } from '../../../src/bounded-contexts/orquestracao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../src/bounded-contexts/orquestracao/domain/events/domain-event.js';
import type { DecisaoWorkflowRepository } from '../../../src/bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { ContextoClassificacao } from '../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-classificacao.vo.js';
import { ContextoExtracao } from '../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';
import { ContextoValidacao } from '../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-validacao.vo.js';
import { NivelConfianca } from '../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';
import { registrarRotaFaixaPrecoCategoria } from '../../../src/bounded-contexts/validacao/interface/http/faixa-preco-categoria.controller.js';
import type { ParametroFaixaPrecoGateway } from '../../../src/bounded-contexts/validacao/domain/gateways/parametro-faixa-preco.gateway.js';
import { CategoriaItem } from '../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { Dinheiro } from '../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { FaixaPreco } from '../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';

/**
 * Issue #690 (ADR-010 T6, spec-007): prova adversarial, na fronteira HTTP real
 * das 2 rotas gated por papel, de que papel forjado (body/query/header) é
 * ignorado — só a claim `cognito:groups` do JWT já verificado por
 * `TenantContextMiddleware` decide `request.papeis`, e só `request.papeis`
 * decide `criarExigenciaPapel`.
 *
 * Restrição da issue: NÃO mocka o middleware de auth (nenhum fake preHandler
 * que popule `request.papeis` direto) — usa `criarTenantContextMiddleware`
 * real, só com `aws-jwt-verify` mockado, mesmo padrão de
 * `tenantid-forjado-http-adversarial.test.ts` (#635).
 */

const { mockVerify, mockCreate } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return { mockVerify, mockCreate: vi.fn(() => ({ verify: mockVerify })) };
});

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

/** Middleware real de tenant/papel — token verificado carrega `cognito:groups` = papéis reais. */
function middlewareComPapeis(
  tenantId: TenantId,
  papeisReais: readonly string[],
): ReturnType<typeof criarTenantContextMiddleware> {
  mockVerify.mockResolvedValue({
    sub: 'usuario-teste',
    'custom:tenant_id': tenantId.toString(),
    'cognito:groups': papeisReais,
  });
  return criarTenantContextMiddleware({ userPoolId: 'us-east-1_teste', clientId: 'client-teste' });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockCreate.mockClear();
});

describe('POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana — papel forjado (issue #690)', () => {
  class DecisaoWorkflowRepositoryFake implements DecisaoWorkflowRepository {
    private readonly registros = new Map<string, DecisaoWorkflow>();
    async salvar(decisaoWorkflow: DecisaoWorkflow): Promise<void> {
      this.registros.set(decisaoWorkflow.orcamentoId.toString(), decisaoWorkflow);
    }
    async buscarPorOrcamentoId(id: OrcamentoId): Promise<DecisaoWorkflow | undefined> {
      return this.registros.get(id.toString());
    }
  }

  class EventPublisherFake implements EventPublisher {
    publicados: DomainEventEnvelope[] = [];
    async publicar(evento: DomainEventEnvelope): Promise<void> {
      this.publicados.push(evento);
    }
  }

  function agregadoPendenteRevisaoHumana(id: OrcamentoId, tenantId: TenantId): DecisaoWorkflow {
    const agregado = DecisaoWorkflow.criar(id, tenantId);
    agregado.registrarContextoClassificacao(
      ContextoClassificacao.de({
        fornecedorIdentificado: 'Fornecedor XYZ',
        formatoIdentificado: 'PDF',
      }),
      tenantId,
    );
    agregado.registrarContextoExtracao(
      ContextoExtracao.de({
        itensResumo: '10x parafuso',
        condicoesComerciaisResumo: '30 dias',
        houvePendenciaConfirmada: false,
      }),
      tenantId,
    );
    agregado.registrarContextoValidacao(ContextoValidacao.de({ resultado: 'VALIDADO' }), tenantId);
    agregado.consolidarContexto();
    agregado.registrarTentativaOrquestrador({
      acao: 'APROVAR',
      nivelConfianca: NivelConfianca.de(40),
      criterio: 'Confiança baixa',
      requerIntegracaoExterna: false,
    });
    return agregado;
  }

  function montarApp(tenantId: TenantId, papeisReais: readonly string[]) {
    const repositorio = new DecisaoWorkflowRepositoryFake();
    const publisher = new EventPublisherFake();
    const app = Fastify();
    registrarRotaDecisaoHumanaWorkflow(
      app,
      new RegistrarDecisaoHumanaWorkflow(() => repositorio, publisher),
      new ConsultarStatusDecisaoWorkflow(() => repositorio),
      { preHandler: middlewareComPapeis(tenantId, papeisReais) },
    );
    return { app, repositorio, publisher };
  }

  it('403 — token sem comprador-responsavel, papel forjado no BODY é ignorado', async () => {
    const tenantId = TenantId.novo();
    const { app, repositorio, publisher } = montarApp(tenantId, ['outro-papel']);
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726c1');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, tenantId));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      headers: { authorization: 'Bearer token-sem-papel' },
      payload: {
        acao: 'APROVAR',
        justificativa: 'Forjando papel no corpo.',
        papeis: ['comprador-responsavel'],
        papel: 'comprador-responsavel',
      },
    });

    expect(resposta.statusCode).toBe(403);
    expect(publisher.publicados).toHaveLength(0);
    await app.close();
  });

  it('403 — token sem comprador-responsavel, papel forjado em HEADER customizado é ignorado', async () => {
    const tenantId = TenantId.novo();
    const { app, repositorio, publisher } = montarApp(tenantId, ['outro-papel']);
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726c2');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, tenantId));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      headers: {
        authorization: 'Bearer token-sem-papel',
        'x-papel': 'comprador-responsavel',
        'x-role': 'comprador-responsavel',
        'x-papeis': 'comprador-responsavel',
      },
      payload: { acao: 'APROVAR', justificativa: 'Forjando papel no header.' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(publisher.publicados).toHaveLength(0);
    await app.close();
  });

  it('403 — token sem comprador-responsavel, papel forjado na QUERY STRING é ignorado', async () => {
    const tenantId = TenantId.novo();
    const { app, repositorio, publisher } = montarApp(tenantId, ['outro-papel']);
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726c3');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, tenantId));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana?papel=comprador-responsavel&papeis=comprador-responsavel`,
      headers: { authorization: 'Bearer token-sem-papel' },
      payload: { acao: 'APROVAR', justificativa: 'Forjando papel na query.' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(publisher.publicados).toHaveLength(0);
    await app.close();
  });

  it('200 — token COM comprador-responsavel autoriza (contraprova: a claim real funciona)', async () => {
    const tenantId = TenantId.novo();
    const { app, repositorio, publisher } = montarApp(tenantId, ['comprador-responsavel']);
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726c4');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, tenantId));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      headers: { authorization: 'Bearer token-com-papel' },
      payload: { acao: 'APROVAR', justificativa: 'Comprador validou.' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(publisher.publicados).toHaveLength(1);
    await app.close();
  });
});

describe('POST /v1/configuracoes/faixas-preco-categoria — papel forjado (issue #690)', () => {
  class ParametroFaixaPrecoGatewayFake implements ParametroFaixaPrecoGateway {
    private readonly faixas = new Map<string, FaixaPreco>();
    async listarTodas(): Promise<readonly FaixaPreco[]> {
      return [...this.faixas.values()];
    }
    async upsert(faixaPreco: FaixaPreco): Promise<void> {
      this.faixas.set(faixaPreco.categoria.valor, faixaPreco);
    }
  }

  const BODY_VALIDO = {
    categoria: 'embalagens',
    precoMinimo: { valorCentavos: 400, moeda: 'BRL' },
    precoMaximo: { valorCentavos: 1200, moeda: 'BRL' },
  };

  function montarApp(tenantId: TenantId, papeisReais: readonly string[]) {
    const gateway = new ParametroFaixaPrecoGatewayFake();
    const app = Fastify();
    registrarRotaFaixaPrecoCategoria(app, gateway, {
      preHandler: middlewareComPapeis(tenantId, papeisReais),
    });
    return { app, gateway };
  }

  it('403 — token sem compliance-admin, papel forjado no BODY é ignorado', async () => {
    const { app, gateway } = montarApp(TenantId.novo(), ['comprador-responsavel']);

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      headers: { authorization: 'Bearer token-sem-papel' },
      payload: { ...BODY_VALIDO, papel: 'compliance-admin', papeis: ['compliance-admin'] },
    });

    expect(resposta.statusCode).toBe(403);
    expect(await gateway.listarTodas()).toHaveLength(0);
    await app.close();
  });

  it('403 — token sem compliance-admin, papel forjado em HEADER customizado é ignorado', async () => {
    const { app, gateway } = montarApp(TenantId.novo(), ['comprador-responsavel']);

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      headers: {
        authorization: 'Bearer token-sem-papel',
        'x-papel': 'compliance-admin',
        'x-role': 'compliance-admin',
      },
      payload: BODY_VALIDO,
    });

    expect(resposta.statusCode).toBe(403);
    expect(await gateway.listarTodas()).toHaveLength(0);
    await app.close();
  });

  it('403 — token sem compliance-admin, papel forjado na QUERY STRING é ignorado', async () => {
    const { app, gateway } = montarApp(TenantId.novo(), ['comprador-responsavel']);

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria?papel=compliance-admin',
      headers: { authorization: 'Bearer token-sem-papel' },
      payload: BODY_VALIDO,
    });

    expect(resposta.statusCode).toBe(403);
    expect(await gateway.listarTodas()).toHaveLength(0);
    await app.close();
  });

  it('201 — token COM compliance-admin autoriza (contraprova: a claim real funciona)', async () => {
    const { app, gateway } = montarApp(TenantId.novo(), ['compliance-admin']);

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/configuracoes/faixas-preco-categoria',
      headers: { authorization: 'Bearer token-com-papel' },
      payload: BODY_VALIDO,
    });

    expect(resposta.statusCode).toBe(201);
    expect(await gateway.listarTodas()).toHaveLength(1);
    await app.close();
  });

  it('GET 403 — papel forjado em HEADER customizado é ignorado na leitura (plan.md exige papel em POST e GET)', async () => {
    const { app, gateway } = montarApp(TenantId.novo(), ['comprador-responsavel']);
    await gateway.upsert(
      FaixaPreco.de(
        CategoriaItem.de('embalagens'),
        Dinheiro.de(400, 'BRL'),
        Dinheiro.de(1200, 'BRL'),
      ),
    );

    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/configuracoes/faixas-preco-categoria',
      headers: { authorization: 'Bearer token-sem-papel', 'x-papel': 'compliance-admin' },
    });

    expect(resposta.statusCode).toBe(403);
    await app.close();
  });
});
