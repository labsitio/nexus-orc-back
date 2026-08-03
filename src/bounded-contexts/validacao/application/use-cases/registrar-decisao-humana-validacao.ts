import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type {
  DecisaoHumanaValidacao,
  OrcamentoValidacao,
} from '../../domain/orcamento-validacao.aggregate.js';
import { OrcamentoValidado } from '../../domain/events/orcamento-validado.event.js';
import { OrcamentoValidadoComRessalva } from '../../domain/events/orcamento-validado-com-ressalva.event.js';
import type { OrcamentoValidacaoRepository } from '../../domain/repositories/orcamento-validacao.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { OrcamentoValidacaoNaoEncontradoError } from './consultar-status-validacao.js';

/**
 * Endpoint REST de decisão humana (T036, `POST .../validacao/decisao-humana`).
 * Não decide o resultado da regra de negócio — só orquestra: busca o
 * agregado, delega a transição a `registrarDecisaoHumana` (única fonte da
 * regra "só a partir de PENDENTE_REVISAO_HUMANA", `TransicaoInvalidaValidacaoError`
 * quando violada), persiste e publica o evento que resultar do novo status
 * (plan.md). `decisao.inconsistencias` (caso `CORRECAO_APLICADA`) já vem
 * recalculada por quem chama o caso de uso — recomputar regras de
 * consistência é responsabilidade do Domain (T010), fora deste caso de uso.
 *
 * Se a correção ainda deixa inconsistência, o agregado permanece em
 * `PENDENTE_REVISAO_HUMANA` (nova tentativa apenas registrada no histórico)
 * — nenhum evento é publicado nesse caso (plan.md).
 */
export class RegistrarDecisaoHumanaValidacao {
  constructor(
    private readonly repositorio: OrcamentoValidacaoRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(orcamentoId: string, decisao: DecisaoHumanaValidacao): Promise<void> {
    const id = OrcamentoId.de(orcamentoId);
    const validacao = await this.repositorio.buscarPorOrcamentoId(id);
    if (!validacao) {
      throw new OrcamentoValidacaoNaoEncontradoError(orcamentoId);
    }

    validacao.registrarDecisaoHumana(decisao);
    await this.repositorio.salvar(validacao);

    const evento = this.eventoParaStatus(validacao);
    if (evento) {
      await this.eventPublisher.publicar(evento);
    }
  }

  private eventoParaStatus(
    validacao: OrcamentoValidacao,
  ): OrcamentoValidado | OrcamentoValidadoComRessalva | undefined {
    const orcamentoId = validacao.orcamentoId.toString();
    const itens = validacao.dadosExtraidos.itens.map((item) => item.paraPayload());
    const condicoesComerciais = validacao.dadosExtraidos.condicoesComerciais;

    if (validacao.status === 'VALIDADO') {
      return new OrcamentoValidado(orcamentoId, itens, condicoesComerciais);
    }
    if (validacao.status === 'VALIDADO_COM_RESSALVA') {
      return new OrcamentoValidadoComRessalva(
        orcamentoId,
        validacao.inconsistencias.map((inconsistencia) => inconsistencia.paraPayload()),
        itens,
        condicoesComerciais,
      );
    }
    return undefined;
  }
}
