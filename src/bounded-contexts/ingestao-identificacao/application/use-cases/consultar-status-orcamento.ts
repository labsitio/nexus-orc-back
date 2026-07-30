import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { Orcamento } from '../../domain/orcamento.aggregate.js';
import type { OrcamentoRepository } from '../../domain/repositories/orcamento.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';

export class OrcamentoNaoEncontradoError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Orçamento não encontrado: ${orcamentoId}`);
  }
}

/**
 * Query read-only (T046/#51) — nunca escreve no agregado nem no repositório.
 * Retorna o agregado completo (status atual + histórico append-only); a
 * tradução para o formato de resposta HTTP é responsabilidade do controller
 * (T047/#52, `interface/http/status.schema.ts`).
 */
export class ConsultarStatusOrcamento {
  constructor(private readonly repositorio: OrcamentoRepository) {}

  async executar(orcamentoId: string): Promise<Orcamento> {
    const id = OrcamentoId.de(orcamentoId);
    const orcamento = await this.repositorio.buscarPorId(id);
    if (!orcamento) {
      throw new OrcamentoNaoEncontradoError(orcamentoId);
    }
    return orcamento;
  }
}
