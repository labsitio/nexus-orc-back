import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { OrcamentoValidacao } from '../../domain/orcamento-validacao.aggregate.js';
import type { OrcamentoValidacaoRepository } from '../../domain/repositories/orcamento-validacao.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';

export class OrcamentoValidacaoNaoEncontradoError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Validação não encontrada para orçamento: ${orcamentoId}`);
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
  constructor(private readonly repositorio: OrcamentoValidacaoRepository) {}

  async executar(orcamentoId: string): Promise<OrcamentoValidacao> {
    const id = OrcamentoId.de(orcamentoId);
    const orcamentoValidacao = await this.repositorio.buscarPorOrcamentoId(id);
    if (!orcamentoValidacao) {
      throw new OrcamentoValidacaoNaoEncontradoError(orcamentoId);
    }
    return orcamentoValidacao;
  }
}
