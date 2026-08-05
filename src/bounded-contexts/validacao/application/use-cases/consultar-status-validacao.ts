import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { OrcamentoValidacao } from '../../domain/orcamento-validacao.aggregate.js';
import type { CriarOrcamentoValidacaoRepositorio } from '../../domain/repositories/orcamento-validacao.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

export class OrcamentoValidacaoNaoEncontradoError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Validação não encontrada para orçamento: ${orcamentoId}`);
  }
}

/**
 * (issue #656) Disparado quando o `tenantId` do agregado não corresponde ao
 * `tenantId` da requisição — mesmo padrão de `TenantDivergenciaError` do BC
 * Ingestão & Identificação. Retornado como 404 nunca 403, para não revelar
 * ao cliente a existência de uma validação pertencente a outro tenant. Na
 * prática, o repositório tenant-scoped (RLS, `transacaoTenantScoped`) já
 * torna esse cenário irrealizável — mantido como defesa em profundidade.
 */
export class TenantDivergenciaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Acesso negado à validação: ${orcamentoId}`);
  }
}

/**
 * Query read-only (T026/#136) — nunca escreve no agregado nem no repositório.
 * Retorna o agregado completo (status atual + inconsistências + histórico
 * append-only); a tradução para o formato de resposta HTTP é responsabilidade
 * do controller (`interface/http/status.controller.ts`). Mesmo padrão de
 * `ingestao-identificacao/application/use-cases/consultar-status-orcamento.ts`.
 */
export class ConsultarStatusValidacao {
  constructor(private readonly criarRepositorio: CriarOrcamentoValidacaoRepositorio) {}

  async executar(orcamentoId: string, tenantId: TenantId): Promise<OrcamentoValidacao> {
    const id = OrcamentoId.de(orcamentoId);
    // (issue #656) Repositório construído por chamada a partir do `tenantId`
    // já validado do parâmetro — nunca reaproveitado como campo fixo entre
    // chamadas (ver `CriarOrcamentoValidacaoRepositorio`).
    const orcamentoValidacao = await this.criarRepositorio(tenantId).buscarPorOrcamentoId(id);
    if (!orcamentoValidacao) {
      throw new OrcamentoValidacaoNaoEncontradoError(orcamentoId);
    }

    if (orcamentoValidacao.tenantId.toString() !== tenantId.toString()) {
      throw new TenantDivergenciaError(orcamentoId);
    }

    return orcamentoValidacao;
  }
}
