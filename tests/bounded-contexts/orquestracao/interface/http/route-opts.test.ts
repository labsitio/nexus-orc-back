import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { criarTenantContext } from '../../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { ConsultarStatusDecisaoWorkflow } from '../../../../../src/bounded-contexts/orquestracao/application/use-cases/consultar-status-decisao-workflow.js';
import type { DecisaoWorkflow } from '../../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import type { DecisaoWorkflowRepository } from '../../../../../src/bounded-contexts/orquestracao/domain/repositories/decisao-workflow.repository.js';
import { registrarRotaStatusDecisaoWorkflow } from '../../../../../src/bounded-contexts/orquestracao/interface/http/status.controller.js';

/**
 * ADR-010 T3 (`RotaOpts.preHandler` aceita array, #687): prova que o Fastify
 * executa os dois handlers do array, na ordem — não só que o tipo compila.
 * Um teste que só typechecasse deixaria passar a falha silenciosa exata que
 * a task descreve: array aceito no tipo, mas 2º handler (o guard de
 * autorização) nunca chamado em runtime.
 */
describe('RotaOpts.preHandler aceita array (orquestracao)', () => {
  let app: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await app?.close();
  });

  it('executa ambos os preHandlers do array, na ordem declarada', async () => {
    const ordemExecucao: string[] = [];
    const primeiro: preHandlerHookHandler = async (request) => {
      ordemExecucao.push('primeiro');
      request.tenantContext = criarTenantContext(TenantId.novo());
    };
    const segundo: preHandlerHookHandler = async () => {
      ordemExecucao.push('segundo');
    };

    const repositorio: DecisaoWorkflowRepository = {
      salvar: async () => {},
      buscarPorOrcamentoId: async (): Promise<DecisaoWorkflow | undefined> => undefined,
    };

    app = Fastify();
    registrarRotaStatusDecisaoWorkflow(app, new ConsultarStatusDecisaoWorkflow(() => repositorio), {
      preHandler: [primeiro, segundo],
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/01890a5d-ac96-774b-bcce-b02c8f2726a9/workflow/status`,
    });

    expect(ordemExecucao).toEqual(['primeiro', 'segundo']);
    // 404 (não encontrado) confirma que a rota processou a requisição após
    // os dois preHandlers — se o 2º handler não tivesse rodado, o teste de
    // ordem acima já teria falhado antes de chegar aqui.
    expect(resposta.statusCode).toBe(404);
  });

  it('curto-circuita quando o 2º handler do array (guard) responde e nunca chega ao controller', async () => {
    const ordemExecucao: string[] = [];
    const primeiro: preHandlerHookHandler = async (request) => {
      ordemExecucao.push('primeiro');
      request.tenantContext = criarTenantContext(TenantId.novo());
    };
    const segundoNega: preHandlerHookHandler = async (_request, reply) => {
      ordemExecucao.push('segundo');
      await reply.status(403).send({ negado: true });
    };

    const repositorio: DecisaoWorkflowRepository = {
      salvar: async () => {},
      buscarPorOrcamentoId: async (): Promise<DecisaoWorkflow | undefined> => {
        throw new Error('não deveria ser chamado — guard já negou');
      },
    };

    app = Fastify();
    registrarRotaStatusDecisaoWorkflow(app, new ConsultarStatusDecisaoWorkflow(() => repositorio), {
      preHandler: [primeiro, segundoNega],
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/01890a5d-ac96-774b-bcce-b02c8f2726a9/workflow/status`,
    });

    expect(ordemExecucao).toEqual(['primeiro', 'segundo']);
    expect(resposta.statusCode).toBe(403);
  });
});
