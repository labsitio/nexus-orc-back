import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { criarExigenciaPapel } from '../../../../interface/shared/role-guard.middleware.js';
import type { ParametroFaixaPrecoGateway } from '../../domain/gateways/parametro-faixa-preco.gateway.js';
import {
  CategoriaItem,
  CategoriaItemInvalidaError,
} from '../../domain/value-objects/categoria-item.vo.js';
import { Dinheiro, DinheiroInvalidoError } from '../../domain/value-objects/dinheiro.vo.js';
import { FaixaPreco, FaixaPrecoInvalidaError } from '../../domain/value-objects/faixa-preco.vo.js';
import {
  faixaPrecoCategoriaRequestSchema,
  faixaPrecoCategoriaResponseSchema,
  listaFaixasPrecoCategoriaResponseSchema,
} from './faixa-preco-categoria.schema.js';
import type {
  FaixaPrecoCategoriaResponse,
  ProblemDetails,
} from './faixa-preco-categoria.schema.js';
import type { RotaOpts } from './route-opts.js';

/** Traduz o VO de domínio para o contrato de resposta (T044). */
function paraResposta(faixaPreco: FaixaPreco): FaixaPrecoCategoriaResponse {
  return faixaPrecoCategoriaResponseSchema.parse({
    categoria: faixaPreco.categoria.paraPayload(),
    precoMinimo: faixaPreco.precoMinimo.paraPayload(),
    precoMaximo: faixaPreco.precoMaximo.paraPayload(),
  });
}

const PAPEIS_CONFIGURACAO_FAIXA_PRECO = ['compliance-admin'] as const;

/**
 * Compõe `opts.preHandler` (autenticação, injetada pela composição raiz —
 * mesmo padrão de `status.controller.ts`/`decisao-humana.controller.ts`) com
 * o guard de papel desta rota. O guard é aplicado sempre, aqui dentro, e não
 * fica a critério de quem monta a composição raiz — se isso ficasse por
 * conta externa, esquecer de passar `criarExigenciaPapel` no wiring de
 * produção deixaria a rota sem proteção nenhuma (fail-open silencioso).
 * Ordem importa: autenticação (externa) sempre executa antes do guard
 * (appendado por último), e `criarExigenciaPapel` já nega fail-closed quando
 * `request.papeis` não foi populado (ver `role-guard.middleware.ts`).
 */
function comGuardDePapel(opts: RotaOpts): preHandlerHookHandler[] {
  const externos = opts.preHandler
    ? Array.isArray(opts.preHandler)
      ? opts.preHandler
      : [opts.preHandler]
    : [];
  return [...externos, criarExigenciaPapel(PAPEIS_CONFIGURACAO_FAIXA_PRECO)];
}

/**
 * Controllers (T044/#154): `POST` e `GET /v1/configuracoes/faixas-preco-categoria`.
 * Transaction script sem agregado rico (nota de complexidade YAGNI do
 * `plan.md`, seção Interface) — chama `ParametroFaixaPrecoGateway` direto,
 * sem caso de uso de Application dedicado, mesma decisão do `plan.md:145`.
 *
 * Papel exigido em AMBOS os endpoints (`compliance-admin`), não só no
 * `POST`: `plan.md:145` agrupa `POST`/`GET` sob uma única frase de
 * autenticação ("papel administrativo distinto do papel de comprador"),
 * sem distinguir leitura de escrita — decisão de produto sobre visibilidade
 * do parâmetro, não preferência deste agente.
 *
 * Gate de tenant-scoping (issue #154): `faixas_preco_categoria` é catálogo
 * global, deliberadamente não tenant-scoped — decisão já revisada e
 * aprovada (`backend-reviewer` APPROVE WITH NITS + QA "APROVADO PELO QA" em
 * PR #682/#153, ver `specs/003-validacao-consistencia-orcamentos/evidence/
 * qa-final-report-T043.md:164-169`), fundamentada em
 * `specs/007-isolamento-multitenant-dados/plan.md:60` (convenção #4 do
 * retrofit multi-tenant escopa tenant-scoping a "dado de orçamento",
 * excluindo dado de configuração) e `parametro-faixa-preco.gateway.ts`
 * (comentário de arquitetura já existente). Nenhum `tenantId` é lido ou
 * exigido por estes controllers.
 */
export function registrarRotaFaixaPrecoCategoria(
  app: FastifyInstance,
  gateway: ParametroFaixaPrecoGateway,
  opts: RotaOpts = {},
): void {
  app.post(
    '/v1/configuracoes/faixas-preco-categoria',
    { preHandler: comGuardDePapel(opts) },
    async (request, reply) => {
      const body = faixaPrecoCategoriaRequestSchema.safeParse(request.body);
      if (!body.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title: 'Body inválido — categoria, precoMinimo e precoMaximo são obrigatórios',
          status: 400,
          detail: body.error.issues.map((i) => i.message).join('; '),
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      try {
        const faixaPreco = FaixaPreco.de(
          CategoriaItem.de(body.data.categoria),
          Dinheiro.de(body.data.precoMinimo.valorCentavos, body.data.precoMinimo.moeda),
          Dinheiro.de(body.data.precoMaximo.valorCentavos, body.data.precoMaximo.moeda),
        );

        await gateway.upsert(faixaPreco);

        await reply.status(201).send(paraResposta(faixaPreco));
      } catch (erro) {
        // Só os 3 subtipos que este caminho pode de fato lançar — nunca a
        // classe-base `ErroDominio` (achado do backend-reviewer, PR #700):
        // um futuro erro de domínio deste BC não cai aqui por engano sob um
        // título genérico "Faixa de preço inválida" que pode não se aplicar.
        if (
          erro instanceof CategoriaItemInvalidaError ||
          erro instanceof DinheiroInvalidoError ||
          erro instanceof FaixaPrecoInvalidaError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/faixa-preco-invalida',
            title: 'Faixa de preço inválida',
            status: 400,
            detail: erro.message,
          };
          await reply.status(400).type('application/problem+json').send(problema);
          return;
        }
        throw erro;
      }
    },
  );

  app.get(
    '/v1/configuracoes/faixas-preco-categoria',
    { preHandler: comGuardDePapel(opts) },
    async (_request, reply) => {
      const faixasPreco = await gateway.listarTodas();
      await reply
        .status(200)
        .send(listaFaixasPrecoCategoriaResponseSchema.parse(faixasPreco.map(paraResposta)));
    },
  );
}
