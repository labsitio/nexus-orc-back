import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { criarTenantContext } from '../../../../../src/shared-kernel/tenant/tenant-context.js';
import { TenantId } from '../../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { ConsultarStatusValidacao } from '../../../../../src/bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import type { OrcamentoValidacao } from '../../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import type { OrcamentoValidacaoRepository } from '../../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { registrarRotaStatusValidacao } from '../../../../../src/bounded-contexts/validacao/interface/http/status.controller.js';

/**
 * ADR-010 T3 (`RotaOpts.preHandler` aceita array, #687): prova que o Fastify
 * executa os dois handlers do array, na ordem — não só que o tipo compila.
 * Um teste que só typechecasse deixaria passar a falha silenciosa exata que
 * a task descreve: array aceito no tipo, mas 2º handler (o guard de
 * autorização) nunca chamado em runtime.
 */
describe('RotaOpts.preHandler aceita array (validacao)', () => {
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

    const repositorio: OrcamentoValidacaoRepository = {
      salvar: async () => {},
      buscarPorOrcamentoId: async (): Promise<OrcamentoValidacao | undefined> => undefined,
    };

    app = Fastify();
    registrarRotaStatusValidacao(app, new ConsultarStatusValidacao(() => repositorio), {
      preHandler: [primeiro, segundo],
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/01890a5d-ac96-774b-bcce-b02c8f2726a9/validacao/status`,
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

    const repositorio: OrcamentoValidacaoRepository = {
      salvar: async () => {},
      buscarPorOrcamentoId: async (): Promise<OrcamentoValidacao | undefined> => {
        throw new Error('não deveria ser chamado — guard já negou');
      },
    };

    app = Fastify();
    registrarRotaStatusValidacao(app, new ConsultarStatusValidacao(() => repositorio), {
      preHandler: [primeiro, segundoNega],
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/01890a5d-ac96-774b-bcce-b02c8f2726a9/validacao/status`,
    });

    expect(ordemExecucao).toEqual(['primeiro', 'segundo']);
    expect(resposta.statusCode).toBe(403);
  });
});
