import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { ExtracaoOrcamento } from '../../domain/extracao-orcamento.aggregate.js';
import type { CriarExtracaoOrcamentoRepositorio } from '../../domain/repositories/extracao-orcamento.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

export class ExtracaoNaoEncontradaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Extração não encontrada: ${orcamentoId}`);
  }
}

/**
 * (issue #656) Disparado quando o `tenantId` do agregado não corresponde ao
 * `tenantId` da requisição — mesmo padrão de `TenantDivergenciaError` do BC
 * Ingestão & Identificação. Retornado como 404 nunca 403, para não revelar
 * ao cliente a existência de uma extração pertencente a outro tenant. Na
 * prática, o repositório tenant-scoped (RLS, `transacaoTenantScoped`) já
 * torna esse cenário irrealizável — mantido como defesa em profundidade.
 */
export class TenantDivergenciaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Acesso negado à extração: ${orcamentoId}`);
  }
}

/**
 * Query read-only (T024/#89) — nunca escreve no agregado nem no
 * repositório. Retorna o agregado completo (status atual + itens +
 * condições comerciais + histórico append-only); a tradução para o
 * formato de resposta HTTP é responsabilidade do controller
 * (`interface/http/status.schema.ts`, T019/#84). Mesmo padrão de
 * `ConsultarStatusOrcamento` (spec 001) — nenhuma task deste BC previa
 * essa implementação; criada aqui por ser pré-requisito do controller T024.
 */
export class ConsultarStatusExtracao {
  constructor(private readonly criarRepositorio: CriarExtracaoOrcamentoRepositorio) {}

  async executar(orcamentoId: string, tenantId: TenantId): Promise<ExtracaoOrcamento> {
    const id = OrcamentoId.de(orcamentoId);
    // (issue #656) Repositório construído por chamada a partir do `tenantId`
    // já validado do parâmetro — nunca reaproveitado como campo fixo entre
    // chamadas (ver `CriarExtracaoOrcamentoRepositorio`).
    const extracao = await this.criarRepositorio(tenantId).buscarPorOrcamentoId(id);
    if (!extracao) {
      throw new ExtracaoNaoEncontradaError(orcamentoId);
    }

    if (extracao.tenantId.toString() !== tenantId.toString()) {
      throw new TenantDivergenciaError(orcamentoId);
    }

    return extracao;
  }
}
