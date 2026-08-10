import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { ConsultarStatusDecisaoWorkflow } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/consultar-status-decisao-workflow.js';
import { DecisaoWorkflow } from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import type { DecisaoWorkflowRepository } from '../../../../src/bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { ContextoClassificacao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-classificacao.vo.js';
import { ContextoExtracao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';
import { ContextoValidacao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-validacao.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';
import { registrarRotaStatusDecisaoWorkflow } from '../../../../src/bounded-contexts/orquestracao/interface/http/status.controller.js';

/** Contract test do controller real (T030/#236), fake repository (sem Drizzle). */
class DecisaoWorkflowRepositoryFake implements DecisaoWorkflowRepository {
  private readonly registros = new Map<string, DecisaoWorkflow>();

  async salvar(decisaoWorkflow: DecisaoWorkflow): Promise<void> {
    this.registros.set(decisaoWorkflow.orcamentoId.toString(), decisaoWorkflow);
  }

  async buscarPorOrcamentoId(id: OrcamentoId): Promise<DecisaoWorkflow | undefined> {
    return this.registros.get(id.toString());
  }
}

const TENANT_ID = TenantId.novo();

/** PreHandler fake que injeta tenantContext nos testes (mesmo padrão de spec 001/003/007). */
function criarPreHandlerFakeTenant(tenantId: TenantId): preHandlerHookHandler {
  return async (request) => {
    request.tenantContext = criarTenantContext(tenantId);
  };
}

describe('GET /v1/orcamentos/{orcamentoId}/workflow/status — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: DecisaoWorkflowRepositoryFake;

  beforeEach(() => {
    repositorio = new DecisaoWorkflowRepositoryFake();
    app = Fastify();
    registrarRotaStatusDecisaoWorkflow(app, new ConsultarStatusDecisaoWorkflow(() => repositorio), {
      preHandler: criarPreHandlerFakeTenant(TENANT_ID),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 AGUARDANDO_CONTEXTO — nenhum contexto ainda, histórico vazio', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');
    await repositorio.salvar(DecisaoWorkflow.criar(id, TENANT_ID));

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/workflow/status`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      orcamentoId: id.toString(),
      status: 'AGUARDANDO_CONTEXTO',
      historico: [],
    });
  });

  it('200 DECIDIDO — decisão automática do Orquestrador com confiança suficiente', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a2');
    const decisaoWorkflow = DecisaoWorkflow.criar(id, TENANT_ID);
    decisaoWorkflow.registrarContextoClassificacao(
      ContextoClassificacao.de({
        fornecedorIdentificado: 'Fornecedor XPTO',
        formatoIdentificado: 'PDF',
      }),
      TENANT_ID,
    );
    decisaoWorkflow.registrarContextoExtracao(
      ContextoExtracao.de({
        itensResumo: '3 itens',
        condicoesComerciaisResumo: '30 dias',
        houvePendenciaConfirmada: false,
      }),
      TENANT_ID,
    );
    decisaoWorkflow.registrarContextoValidacao(
      ContextoValidacao.de({ resultado: 'VALIDADO' }),
      TENANT_ID,
    );
    decisaoWorkflow.consolidarContexto();
    decisaoWorkflow.registrarTentativaOrquestrador({
      acao: 'APROVAR',
      nivelConfianca: NivelConfianca.de(95),
      criterio: 'contexto consolidado sem inconsistências',
      requerIntegracaoExterna: false,
    });
    await repositorio.salvar(decisaoWorkflow);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/workflow/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('DECIDIDO');
    expect(corpo.decisaoAtual).toMatchObject({
      acao: 'APROVAR',
      nivelConfianca: 95,
      agenteOrigem: 'ORQUESTRADOR',
    });
    expect(corpo.historico).toHaveLength(1);
  });

  it('200 PENDENTE_REVISAO_HUMANA — confiança insuficiente escalona diretamente', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a3');
    const decisaoWorkflow = DecisaoWorkflow.criar(id, TENANT_ID);
    decisaoWorkflow.registrarContextoClassificacao(
      ContextoClassificacao.de({
        fornecedorIdentificado: 'Fornecedor XPTO',
        formatoIdentificado: 'PDF',
      }),
      TENANT_ID,
    );
    decisaoWorkflow.registrarContextoExtracao(
      ContextoExtracao.de({
        itensResumo: '3 itens',
        condicoesComerciaisResumo: '30 dias',
        houvePendenciaConfirmada: false,
      }),
      TENANT_ID,
    );
    decisaoWorkflow.registrarContextoValidacao(
      ContextoValidacao.de({ resultado: 'VALIDADO' }),
      TENANT_ID,
    );
    decisaoWorkflow.consolidarContexto();
    decisaoWorkflow.registrarTentativaOrquestrador({
      acao: 'APROVAR',
      nivelConfianca: NivelConfianca.de(50),
      criterio: 'confiança insuficiente',
      requerIntegracaoExterna: false,
    });
    await repositorio.salvar(decisaoWorkflow);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/workflow/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(corpo.decisaoAtual).toBeUndefined();
    expect(corpo.historico).toHaveLength(1);
    expect(corpo.historico[0].motivoInsucesso).toContain('abaixo do limiar');
  });

  it('200 CONTEXTO_CONSOLIDADO — os 3 contextos presentes, decisão ainda não tentada', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726c1');
    const decisaoWorkflow = DecisaoWorkflow.criar(id, TENANT_ID);
    decisaoWorkflow.registrarContextoClassificacao(
      ContextoClassificacao.de({
        fornecedorIdentificado: 'Fornecedor XPTO',
        formatoIdentificado: 'PDF',
      }),
      TENANT_ID,
    );
    decisaoWorkflow.registrarContextoExtracao(
      ContextoExtracao.de({
        itensResumo: '3 itens',
        condicoesComerciaisResumo: '30 dias',
        houvePendenciaConfirmada: false,
      }),
      TENANT_ID,
    );
    decisaoWorkflow.registrarContextoValidacao(
      ContextoValidacao.de({ resultado: 'VALIDADO' }),
      TENANT_ID,
    );
    decisaoWorkflow.consolidarContexto();
    await repositorio.salvar(decisaoWorkflow);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/workflow/status`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      orcamentoId: id.toString(),
      status: 'CONTEXTO_CONSOLIDADO',
      contextoClassificacao: {
        fornecedorIdentificado: 'Fornecedor XPTO',
        formatoIdentificado: 'PDF',
      },
      contextoExtracao: {
        itensResumo: '3 itens',
        condicoesComerciaisResumo: '30 dias',
        houvePendenciaConfirmada: false,
      },
      contextoValidacao: { resultado: 'VALIDADO', inconsistenciasAceitas: [] },
      historico: [],
    });
  });

  it('401 Problem Details — tenantContext ausente (fallback defensivo do controller)', async () => {
    app = Fastify();
    registrarRotaStatusDecisaoWorkflow(
      app,
      new ConsultarStatusDecisaoWorkflow(() => repositorio),
      { preHandler: async () => {} }, // não popula request.tenantContext
    );
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726c2');

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/workflow/status`,
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('404 Problem Details para orcamentoId inexistente', async () => {
    const idInexistente = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a4');

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idInexistente.toString()}/workflow/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.json()).toMatchObject({ status: 404 });
  });

  it('400 Problem Details para orcamentoId mal formado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/orcamentos/nao-e-uuid/workflow/status',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('404 quando o tenantId do agregado difere do da requisição (defesa em profundidade)', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a5');
    const outroTenant = TenantId.novo();
    await repositorio.salvar(DecisaoWorkflow.criar(id, outroTenant));

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/workflow/status`,
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('propaga (500) erro inesperado do repositório sem mascarar como 404', async () => {
    const appComRepositorioQuebrado = Fastify();
    const repositorioQuebrado: DecisaoWorkflowRepository = {
      salvar: () => {
        throw new Error('não usado neste teste');
      },
      buscarPorOrcamentoId: () => {
        throw new Error('falha inesperada de infraestrutura');
      },
    };
    registrarRotaStatusDecisaoWorkflow(
      appComRepositorioQuebrado,
      new ConsultarStatusDecisaoWorkflow(() => repositorioQuebrado),
      { preHandler: criarPreHandlerFakeTenant(TENANT_ID) },
    );

    const resposta = await appComRepositorioQuebrado.inject({
      method: 'GET',
      url: `/v1/orcamentos/${OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a6').toString()}/workflow/status`,
    });

    expect(resposta.statusCode).toBe(500);
    await appComRepositorioQuebrado.close();
  });
});
