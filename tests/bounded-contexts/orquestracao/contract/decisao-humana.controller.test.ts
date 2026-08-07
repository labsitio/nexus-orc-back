import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { ConsultarStatusDecisaoWorkflow } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/consultar-status-decisao-workflow.js';
import { RegistrarDecisaoHumanaWorkflow } from '../../../../src/bounded-contexts/orquestracao/application/use-cases/registrar-decisao-humana-workflow.js';
import { DecisaoWorkflow } from '../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/orquestracao/domain/events/domain-event.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/orquestracao/domain/gateways/event-publisher.js';
import type { DecisaoWorkflowRepository } from '../../../../src/bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { ContextoClassificacao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-classificacao.vo.js';
import { ContextoExtracao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';
import { ContextoValidacao } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-validacao.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';
import { registrarRotaDecisaoHumanaWorkflow } from '../../../../src/bounded-contexts/orquestracao/interface/http/decisao-humana.controller.js';

/** Contract test do controller real (T044/#250), fake repository/publisher (sem Drizzle/EventBridge). */
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

const TENANT_ID = TenantId.novo();

/** PreHandler fake que injeta tenantContext + papéis, simulando `TenantContextMiddleware` (ADR-010). */
function criarPreHandlerFakeAutenticado(
  tenantId: TenantId,
  papeis: readonly string[] = ['comprador-responsavel'],
): preHandlerHookHandler {
  return async (request) => {
    request.tenantContext = criarTenantContext(tenantId);
    request.papeis = papeis;
  };
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

describe('POST /v1/orcamentos/{orcamentoId}/workflow/decisao-humana — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: DecisaoWorkflowRepositoryFake;
  let publisher: EventPublisherFake;

  function montarApp(preHandler: preHandlerHookHandler | preHandlerHookHandler[]): void {
    app = Fastify();
    registrarRotaDecisaoHumanaWorkflow(
      app,
      new RegistrarDecisaoHumanaWorkflow(() => repositorio, publisher),
      new ConsultarStatusDecisaoWorkflow(() => repositorio),
      { preHandler },
    );
  }

  beforeEach(() => {
    repositorio = new DecisaoWorkflowRepositoryFake();
    publisher = new EventPublisherFake();
    montarApp(criarPreHandlerFakeAutenticado(TENANT_ID));
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 — APROVAR com justificativa registra decisão HUMANO e retorna status DECIDIDO', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b1');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, TENANT_ID));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'APROVAR', justificativa: 'Comprador validou manualmente após revisão.' },
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('DECIDIDO');
    expect(corpo.decisaoAtual).toMatchObject({ acao: 'APROVAR', agenteOrigem: 'HUMANO' });
    expect(publisher.publicados).toHaveLength(1);
  });

  it('200 — SOLICITAR_REENVIO com motivoDadoAusente registra decisão', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b2');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, TENANT_ID));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: {
        acao: 'SOLICITAR_REENVIO',
        justificativa: 'Falta CNPJ do fornecedor no documento.',
        motivoDadoAusente: 'CNPJ do fornecedor ausente no orçamento recebido.',
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().decisaoAtual).toMatchObject({ acao: 'SOLICITAR_REENVIO' });
  });

  it('400 Problem Details — justificativa ausente', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b3');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, TENANT_ID));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'APROVAR' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details — SOLICITAR_REENVIO sem motivoDadoAusente', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b4');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, TENANT_ID));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'SOLICITAR_REENVIO', justificativa: 'Falta dado.' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('400 Problem Details — orcamentoId mal formado', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/nao-e-uuid/workflow/decisao-humana',
      payload: { acao: 'APROVAR', justificativa: 'x' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('404 Problem Details — orcamentoId inexistente', async () => {
    const idInexistente = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b5');

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${idInexistente.toString()}/workflow/decisao-humana`,
      payload: { acao: 'APROVAR', justificativa: 'x' },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toMatchObject({ status: 404 });
  });

  it('404 quando o tenantId do agregado difere do da requisição (defesa em profundidade)', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b6');
    const outroTenant = TenantId.novo();
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, outroTenant));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'APROVAR', justificativa: 'x' },
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('409 Problem Details — orçamento não está em PENDENTE_REVISAO_HUMANA', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b7');
    await repositorio.salvar(DecisaoWorkflow.criar(id, TENANT_ID)); // AGUARDANDO_CONTEXTO

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'APROVAR', justificativa: 'x' },
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 — Zod já rejeita motivoDadoAusente só com espaços (mesma checagem do domínio, mas antes dele)', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726bd');
    await repositorio.salvar(agregadoPendenteRevisaoHumana(id, TENANT_ID));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'SOLICITAR_REENVIO', justificativa: 'x', motivoDadoAusente: '   ' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  describe('Segurança — papel "comprador responsável" (ADR-010)', () => {
    it('403 quando request.papeis não contém comprador-responsavel, mesmo com "papeis" forjado no body', async () => {
      montarApp(criarPreHandlerFakeAutenticado(TENANT_ID, ['outro-papel']));
      const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b8');
      await repositorio.salvar(agregadoPendenteRevisaoHumana(id, TENANT_ID));

      const resposta = await app.inject({
        method: 'POST',
        url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
        payload: {
          acao: 'APROVAR',
          justificativa: 'x',
          papeis: ['comprador-responsavel'], // campo estranho ao schema — ignorado, sem efeito no guard
        },
      });

      expect(resposta.statusCode).toBe(403);
    });

    it('403 — fail-closed: guard sempre presente mesmo sem preHandler de autenticação do chamador', async () => {
      montarApp([]); // nenhum preHandler externo: request.papeis fica undefined
      const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726b9');
      await repositorio.salvar(agregadoPendenteRevisaoHumana(id, TENANT_ID));

      const resposta = await app.inject({
        method: 'POST',
        url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
        payload: { acao: 'APROVAR', justificativa: 'x' },
      });

      expect(resposta.statusCode).toBe(403);
    });

    it('autenticação roda antes do guard, na ordem — array de preHandler do chamador seguido do guard', async () => {
      const ordemExecucao: string[] = [];
      const autenticacaoFake: preHandlerHookHandler = async (request) => {
        ordemExecucao.push('autenticacao');
        request.tenantContext = criarTenantContext(TENANT_ID);
        request.papeis = ['comprador-responsavel'];
      };

      montarApp([autenticacaoFake]);
      const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726ba');
      await repositorio.salvar(agregadoPendenteRevisaoHumana(id, TENANT_ID));

      const resposta = await app.inject({
        method: 'POST',
        url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
        payload: { acao: 'APROVAR', justificativa: 'x' },
      });

      // autenticação rodou (populou request.papeis) e o guard, executado depois,
      // autorizou — 200 só é possível se a ordem (autenticação → guard) foi respeitada.
      expect(ordemExecucao).toEqual(['autenticacao']);
      expect(resposta.statusCode).toBe(200);
    });
  });

  it('401 Problem Details — papel presente mas tenantContext ausente (fallback defensivo)', async () => {
    montarApp(async (request) => {
      request.papeis = ['comprador-responsavel']; // sem popular request.tenantContext
    });
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726bc');

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'APROVAR', justificativa: 'x' },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('sem opts.preHandler (default {}) — guard ainda protege a rota', async () => {
    app = Fastify();
    registrarRotaDecisaoHumanaWorkflow(
      app,
      new RegistrarDecisaoHumanaWorkflow(() => repositorio, publisher),
      new ConsultarStatusDecisaoWorkflow(() => repositorio),
    );
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726be');

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'APROVAR', justificativa: 'x' },
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('erro de domínio não mapeado propaga (500) em vez de virar Problem Details silencioso', async () => {
    class RepositorioQuebrado extends DecisaoWorkflowRepositoryFake {
      async buscarPorOrcamentoId(): Promise<never> {
        throw new Error('falha inesperada de infraestrutura');
      }
    }
    repositorio = new RepositorioQuebrado();
    montarApp(criarPreHandlerFakeAutenticado(TENANT_ID));
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726bf');

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/workflow/decisao-humana`,
      payload: { acao: 'APROVAR', justificativa: 'x' },
    });

    expect(resposta.statusCode).toBe(500);
  });
});
