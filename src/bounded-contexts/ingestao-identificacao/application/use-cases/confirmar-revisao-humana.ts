import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { Orcamento } from '../../domain/orcamento.aggregate.js';
import { OrcamentoReclassificadoPorRevisaoHumana } from '../../domain/events/orcamento-reclassificado-revisao-humana.event.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import { NivelConfianca } from '../../domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { ResultadoClassificacao } from '../../domain/value-objects/resultado-classificacao.vo.js';
import type { OrcamentoRepository } from '../../domain/repositories/orcamento.repository.js';

/** Confiança fixa de confirmação humana explícita — não é uma estimativa, é decisão humana direta. */
const CONFIANCA_CONFIRMACAO_HUMANA = 100;

export class OrcamentoNaoEncontradoParaRevisaoHumanaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Orçamento não encontrado para confirmação humana: ${orcamentoId}`);
  }
}

export interface ConfirmarRevisaoHumanaParams {
  readonly orcamentoId: string;
  readonly fornecedorIdentificado: string;
  readonly formatoIdentificado: string;
}

/**
 * Caso de uso `ConfirmarRevisaoHumana` (T052/#57). Acionado pelo endpoint
 * REST de confirmação (T053/#58) quando um orçamento escalonado para
 * revisão humana é confirmado explicitamente. Delega a validação de
 * transição ao próprio agregado (`Orcamento.registrarConfirmacaoHumana`,
 * T007/#12) — só é transição válida a partir de `PENDENTE_REVISAO_HUMANA`;
 * fora disso o agregado lança `TransicaoInvalidaError` (controller mapeia
 * para 409 Problem Details). Publica `OrcamentoReclassificadoPorRevisaoHumana`
 * ao final (T055/#60) — auditoria da correção manual (plan.md).
 */
export class ConfirmarRevisaoHumana {
  constructor(
    private readonly repositorio: OrcamentoRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(params: ConfirmarRevisaoHumanaParams): Promise<Orcamento> {
    const id = OrcamentoId.de(params.orcamentoId);
    const orcamento = await this.repositorio.buscarPorId(id);
    if (!orcamento) {
      throw new OrcamentoNaoEncontradoParaRevisaoHumanaError(params.orcamentoId);
    }

    const resultado = ResultadoClassificacao.criar({
      fornecedorIdentificado: params.fornecedorIdentificado,
      formatoIdentificado: params.formatoIdentificado,
      nivelConfianca: NivelConfianca.de(CONFIANCA_CONFIRMACAO_HUMANA),
      agenteOrigem: 'HUMANO',
    });

    orcamento.registrarConfirmacaoHumana(resultado);
    await this.repositorio.salvar(orcamento);

    await this.eventPublisher.publicar(
      new OrcamentoReclassificadoPorRevisaoHumana(orcamento.id.toString(), resultado.paraPayload()),
    );

    return orcamento;
  }
}
