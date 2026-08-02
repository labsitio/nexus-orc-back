import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { AgenteEmbeddingGateway } from '../../domain/gateways/agente-embedding.gateway.js';
import type { AgenteInterpretadorConsultaGateway } from '../../domain/gateways/agente-interpretador-consulta.gateway.js';
import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { IndiceOrcamentoRepository } from '../../domain/repositories/indice-orcamento.repository.js';
import {
  CriterioBusca,
  type PeriodoRecebimento,
} from '../../domain/value-objects/criterio-busca.vo.js';
import type { Dinheiro } from '../../domain/value-objects/dinheiro.vo.js';
import type { ResultadoBusca } from '../../domain/value-objects/resultado-busca.vo.js';

export class BuscarOrcamentosInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`BuscarOrcamentos inválido: ${mensagem}`);
  }
}

const LIMITE_PADRAO = 20;

/**
 * Filtros estruturados enviados explicitamente na requisição (T039 —
 * `POST /v1/orcamentos/busca`). Deliberadamente sem campo `tenantId`: o
 * tenant nunca chega por aqui, apenas pelo parâmetro dedicado de
 * `BuscarOrcamentos.executar` (vindo do `TenantContext`/JWT, nunca de
 * body/query — convenção #5 da spec 007, plan.md).
 */
export interface FiltrosExplicitosBusca {
  readonly categoria?: string;
  readonly precoMinimo?: Dinheiro;
  readonly precoMaximo?: Dinheiro;
  readonly periodoRecebimento?: PeriodoRecebimento;
}

export interface BuscarOrcamentosInput {
  readonly consultaLinguagemNatural: string;
  readonly filtrosExplicitos?: FiltrosExplicitosBusca;
  readonly limite?: number;
}

/**
 * Caso de uso síncrono acionado pelo endpoint `POST /v1/orcamentos/busca`
 * (T039, ainda não implementado). Interpreta a consulta em linguagem natural
 * via `AgenteInterpretadorConsultaGateway`, mescla o resultado com os filtros
 * explícitos da requisição — **filtro explícito nunca é sobrescrito pela
 * interpretação da IA, apenas complementado quando o campo correspondente
 * não foi informado** (plan.md) —, gera o vetor de consulta via
 * `AgenteEmbeddingGateway` sobre o `textoLivreResidual` residual e executa a
 * busca híbrida determinística via `IndiceOrcamentoRepository`. Nunca
 * escreve.
 *
 * `tenantId` é sempre exigido como parâmetro dedicado e nunca aceito dentro
 * de `filtrosExplicitos` (o tipo do input nem expõe esse campo) — o
 * isolamento cross-tenant real da consulta é garantido pelo `TenantContext`
 * já fixado na instância de `IndiceOrcamentoRepository` injetada
 * (`DrizzleTenantScopedRepositoryBase`, ADR-005); este parâmetro existe para
 * que a chamada nunca seja feita sem um tenant explícito resolvido pela
 * Interface a partir do JWT.
 */
export class BuscarOrcamentos {
  constructor(
    private readonly interpretador: AgenteInterpretadorConsultaGateway,
    private readonly embeddingGateway: AgenteEmbeddingGateway,
    private readonly repositorio: IndiceOrcamentoRepository,
    private readonly catalogoCategorias: readonly string[],
  ) {}

  async executar(
    tenantId: TenantId,
    input: BuscarOrcamentosInput,
  ): Promise<readonly ResultadoBusca[]> {
    if (!tenantId) {
      throw new BuscarOrcamentosInvalidoError('tenantId é obrigatório');
    }

    const interpretado = await this.interpretador.interpretar({
      consultaLinguagemNatural: input.consultaLinguagemNatural,
      catalogoCategorias: this.catalogoCategorias,
    });

    const explicito = input.filtrosExplicitos;
    const criterio = CriterioBusca.de({
      categoria: explicito?.categoria ?? interpretado.categoria,
      precoMinimo: explicito?.precoMinimo ?? interpretado.precoMinimo,
      precoMaximo: explicito?.precoMaximo ?? interpretado.precoMaximo,
      periodoRecebimento: explicito?.periodoRecebimento ?? interpretado.periodoRecebimento,
      textoLivreResidual: interpretado.textoLivreResidual,
    });

    const vetorConsulta = criterio.textoLivreResidual.trim()
      ? await this.embeddingGateway.gerarEmbedding(criterio.textoLivreResidual)
      : undefined;

    // `input.limite` não é validado aqui (sem teto/negativo) — borda de
    // entrada é responsabilidade do Zod schema do controller (T039), mesma
    // disciplina de `tenantId` acima: este caso de uso confia no contrato já
    // validado pela Interface, nunca revalida o que já é responsabilidade dela.
    return this.repositorio.buscarPorCriterioEVetor(
      criterio,
      vetorConsulta,
      input.limite ?? LIMITE_PADRAO,
    );
  }
}
