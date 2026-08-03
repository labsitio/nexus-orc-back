import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { ExtracaoOrcamento } from '../../domain/extracao-orcamento.aggregate.js';
import type { ExtracaoOrcamentoRepository } from '../../domain/repositories/extracao-orcamento.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';

export class ExtracaoNaoEncontradaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Extração não encontrada: ${orcamentoId}`);
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
  constructor(private readonly repositorio: ExtracaoOrcamentoRepository) {}

  async executar(orcamentoId: string): Promise<ExtracaoOrcamento> {
    const id = OrcamentoId.de(orcamentoId);
    const extracao = await this.repositorio.buscarPorOrcamentoId(id);
    if (!extracao) {
      throw new ExtracaoNaoEncontradaError(orcamentoId);
    }
    return extracao;
  }
}
