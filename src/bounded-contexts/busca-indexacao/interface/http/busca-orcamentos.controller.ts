import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../../../shared-kernel/tenant/tenant-context.js';
import {
  BuscarOrcamentos,
  BuscarOrcamentosInvalidoError,
  type FiltrosExplicitosBusca,
} from '../../application/use-cases/buscar-orcamentos.js';
import { CriterioBuscaInvalidoError } from '../../domain/value-objects/criterio-busca.vo.js';
import { Dinheiro, DinheiroInvalidoError } from '../../domain/value-objects/dinheiro.vo.js';
import { ResultadoBuscaInvalidoError } from '../../domain/value-objects/resultado-busca.vo.js';
import type { AgenteInterpretadorConsultaGateway } from '../../domain/gateways/agente-interpretador-consulta.gateway.js';
import type { AgenteEmbeddingGateway } from '../../domain/gateways/agente-embedding.gateway.js';
import type { IndiceOrcamentoRepository } from '../../domain/repositories/indice-orcamento.repository.js';
import type { RotaOpts } from './route-opts.js';
import { buscaOrcamentosRequestSchema } from './busca-orcamentos.schema.js';
import type { BuscaOrcamentosResponse, ProblemDetails } from './busca-orcamentos.schema.js';

/**
 * Teto de itens efetivamente buscados no repositório por requisição
 * (`pagina * tamanhoPagina`, ver `registrarRotaBuscaOrcamentos` abaixo) —
 * evita que uma `pagina` grande vinda de um cliente force um `limite`
 * desproporcional na query pgvector.
 *
 * ponytail: `IndiceOrcamentoRepository.buscarPorCriterioEVetor` (T038) só
 * aceita `limite`, sem offset — não há suporte a paginação real na
 * Infrastructure ainda. Contorno aqui: sobre-busca `pagina * tamanhoPagina`
 * itens e faz o slice da página pedida nesta camada. Funciona para poucas
 * páginas; se o produto passar a exigir deep pagination, adicionar offset em
 * `IndiceOrcamentoRepository`/`DrizzlePgvectorIndiceOrcamentoRepository`.
 */
const LIMITE_MAXIMO_SOBRE_BUSCA = 1000;

export interface BuscaOrcamentosDependencias {
  readonly interpretador: AgenteInterpretadorConsultaGateway;
  readonly embeddingGateway: AgenteEmbeddingGateway;
  readonly criarRepositorio: (tenantContext: TenantContext) => IndiceOrcamentoRepository;
  readonly catalogoCategorias: readonly string[];
}

function problemaValidacao(detail: string): ProblemDetails {
  return {
    type: 'https://nexo.internal/problems/validacao',
    title: 'Requisição de busca inválida',
    status: 400,
    detail,
  };
}

/**
 * Controller (T039/#199): `POST /v1/orcamentos/busca`.
 *
 * Leitura sem efeito colateral (idempotente/segura), documentada com verbo
 * POST por padrão de API de busca com corpo estruturado (evita limite de
 * querystring — mesma nota do `docs/openapi.yaml`).
 *
 * `tenantId` sempre vem do `TenantContext` resolvido pelo
 * `TenantContextMiddleware` (`opts.preHandler`) — nunca de body/query, mesma
 * disciplina do controller de status (T031).
 *
 * RISCO CONHECIDO (spec 004, plan.md): autentica via JWT mas não filtra
 * resultado por permissão de visibilidade de orçamento individual — qualquer
 * usuário autenticado do tenant pode encontrar qualquer orçamento validado
 * do próprio tenant. Aceitável apenas em single-tenant (Fase 01/02).
 */
export function registrarRotaBuscaOrcamentos(
  app: FastifyInstance,
  dependencias: BuscaOrcamentosDependencias,
  opts: RotaOpts = {},
): void {
  app.post('/v1/orcamentos/busca', { preHandler: opts.preHandler }, async (request, reply) => {
    const corpo = buscaOrcamentosRequestSchema.safeParse(request.body);
    if (!corpo.success) {
      await reply
        .status(400)
        .type('application/problem+json')
        .send(problemaValidacao(corpo.error.issues.map((i) => i.message).join('; ')));
      return;
    }

    const tenantContext = request.tenantContext;
    if (!tenantContext) {
      const problema: ProblemDetails = {
        type: 'https://nexo.internal/problems/nao-autenticado',
        title: 'Contexto de tenant ausente — TenantContextMiddleware não aplicado',
        status: 401,
      };
      await reply.status(401).type('application/problem+json').send(problema);
      return;
    }

    const dados = corpo.data;

    try {
      const filtrosExplicitos: FiltrosExplicitosBusca = {
        categoria: dados.categoria,
        precoMinimo: dados.precoMinimo
          ? Dinheiro.de(dados.precoMinimo.valorCentavos, dados.precoMinimo.moeda)
          : undefined,
        precoMaximo: dados.precoMaximo
          ? Dinheiro.de(dados.precoMaximo.valorCentavos, dados.precoMaximo.moeda)
          : undefined,
        periodoRecebimento:
          dados.periodoInicio && dados.periodoFim
            ? { inicio: new Date(dados.periodoInicio), fim: new Date(dados.periodoFim) }
            : undefined,
      };

      const limiteSobreBusca = Math.min(
        dados.pagina * dados.tamanhoPagina,
        LIMITE_MAXIMO_SOBRE_BUSCA,
      );

      const useCase = new BuscarOrcamentos(
        dependencias.interpretador,
        dependencias.embeddingGateway,
        dependencias.criarRepositorio(tenantContext),
        dependencias.catalogoCategorias,
      );

      const todosResultados = await useCase.executar(tenantContext.tenantId, {
        consultaLinguagemNatural: dados.consulta,
        filtrosExplicitos,
        limite: limiteSobreBusca,
      });

      const inicio = (dados.pagina - 1) * dados.tamanhoPagina;
      const fim = inicio + dados.tamanhoPagina;
      const pagina = todosResultados.slice(inicio, fim);

      // A janela de sobre-busca veio saturada (`length === limiteSobreBusca`)
      // significa que o repositório pode ter mais matches além do que foi
      // pedido — não dá para provar que não há mais só pelo tamanho da
      // janela. Nesse caso, `temProximaPagina` é conservadoramente `true`;
      // só quando a janela veio incompleta (repositório já esgotou os
      // matches) o `false` é uma garantia real (achado do backend-reviewer).
      const janelaSaturada = todosResultados.length === limiteSobreBusca;
      const temProximaPagina = janelaSaturada ? true : fim < todosResultados.length;

      const resposta: BuscaOrcamentosResponse = {
        resultados: pagina.map((r) => ({
          orcamentoId: r.orcamentoId.toString(),
          scoreRelevancia: r.scoreRelevancia,
          trechoDestacado: r.trechoDestacado,
        })),
        pagina: dados.pagina,
        tamanhoPagina: dados.tamanhoPagina,
        totalAproximado: todosResultados.length,
        temProximaPagina,
      };

      await reply.status(200).send(resposta);
    } catch (erro) {
      if (
        erro instanceof BuscarOrcamentosInvalidoError ||
        erro instanceof CriterioBuscaInvalidoError ||
        erro instanceof DinheiroInvalidoError ||
        erro instanceof ResultadoBuscaInvalidoError
      ) {
        await reply
          .status(400)
          .type('application/problem+json')
          .send(problemaValidacao(erro.message));
        return;
      }
      throw erro;
    }
  });
}
