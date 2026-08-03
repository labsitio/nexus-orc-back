import { describe, expect, it } from 'vitest';
import { RegistrarDecisaoHumanaValidacao } from '../../../../src/bounded-contexts/validacao/application/use-cases/registrar-decisao-humana-validacao.js';
import { OrcamentoValidacaoNaoEncontradoError } from '../../../../src/bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import {
  OrcamentoValidacao,
  TransicaoInvalidaValidacaoError,
} from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import { OrcamentoValidado } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado.event.js';
import { OrcamentoValidadoComRessalva } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado-com-ressalva.event.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/validacao/domain/events/domain-event.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/validacao/domain/gateways/event-publisher.js';
import type { OrcamentoValidacaoRepository } from '../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { InconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';

/**
 * T035 (#145) — Application: `RegistrarDecisaoHumanaValidacao`. Unit test
 * com fake in-memory de repositório e publisher, mesmo padrão de
 * `validar-orcamento.test.ts`/`consultar-status-validacao.test.ts`.
 */

class OrcamentoValidacaoRepositoryFake implements OrcamentoValidacaoRepository {
  salvos: OrcamentoValidacao[] = [];
  constructor(private existente: OrcamentoValidacao | undefined = undefined) {}

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    this.salvos.push(orcamentoValidacao);
    this.existente = orcamentoValidacao;
  }

  async buscarPorOrcamentoId(): Promise<OrcamentoValidacao | undefined> {
    return this.existente;
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

const ORCAMENTO_ID = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');

function dadosExtraidos(): DadosExtraidosParaValidacao {
  return DadosExtraidosParaValidacao.de({
    cnpjFornecedor: '11222333000181',
    itens: [
      ItemParaValidacao.de({
        descricao: 'Caixa de papelão ondulado 40x30x20',
        quantidade: 500,
        precoUnitario: Dinheiro.de(320, 'BRL'),
        extraido: true,
      }),
    ],
    condicoesComerciais: '30/60/90 dias',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
  });
}

function orcamentoPendenteRevisaoHumana(): OrcamentoValidacao {
  const validacao = OrcamentoValidacao.criar(ORCAMENTO_ID, dadosExtraidos());
  validacao.avaliarRegrasDeConsistencia([
    InconsistenciaDetectada.de('PRAZO_INCOERENTE', 'Período de validade anterior à emissão'),
  ]);
  return validacao;
}

describe('RegistrarDecisaoHumanaValidacao', () => {
  it('publica OrcamentoValidado quando CORRECAO_APLICADA reavalia sem inconsistências restantes', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake(orcamentoPendenteRevisaoHumana());
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaValidacao(repositorio, publisher);

    await useCase.executar(ORCAMENTO_ID.toString(), {
      tipo: 'CORRECAO_APLICADA',
      inconsistencias: [],
    });

    expect(repositorio.salvos[0]!.status).toBe('VALIDADO');
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as OrcamentoValidado;
    expect(evento.detailType).toBe(OrcamentoValidado.detailType);
    expect(evento.orcamentoId).toBe(ORCAMENTO_ID.toString());
  });

  it('publica OrcamentoValidadoComRessalva quando a decisão é ACEITE_COM_RESSALVA', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake(orcamentoPendenteRevisaoHumana());
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaValidacao(repositorio, publisher);

    await useCase.executar(ORCAMENTO_ID.toString(), { tipo: 'ACEITE_COM_RESSALVA' });

    expect(repositorio.salvos[0]!.status).toBe('VALIDADO_COM_RESSALVA');
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as OrcamentoValidadoComRessalva;
    expect(evento.detailType).toBe(OrcamentoValidadoComRessalva.detailType);
    expect(evento.inconsistencias.map((i) => i.regra)).toContain('PRAZO_INCOERENTE');
  });

  it('nunca publica evento quando a correção ainda deixa inconsistência (permanece em revisão humana)', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake(orcamentoPendenteRevisaoHumana());
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaValidacao(repositorio, publisher);

    await useCase.executar(ORCAMENTO_ID.toString(), {
      tipo: 'CORRECAO_APLICADA',
      inconsistencias: [
        InconsistenciaDetectada.de('PRAZO_INCOERENTE', 'Ainda incoerente após correção'),
      ],
    });

    expect(repositorio.salvos[0]!.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('lança TransicaoInvalidaValidacaoError quando o agregado não está em PENDENTE_REVISAO_HUMANA', async () => {
    const validado = OrcamentoValidacao.criar(ORCAMENTO_ID, dadosExtraidos());
    validado.avaliarRegrasDeConsistencia([]);
    const repositorio = new OrcamentoValidacaoRepositoryFake(validado);
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaValidacao(repositorio, publisher);

    await expect(
      useCase.executar(ORCAMENTO_ID.toString(), { tipo: 'ACEITE_COM_RESSALVA' }),
    ).rejects.toThrow(TransicaoInvalidaValidacaoError);
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('lança OrcamentoValidacaoNaoEncontradoError para orcamentoId inexistente', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaValidacao(repositorio, publisher);

    await expect(
      useCase.executar(ORCAMENTO_ID.toString(), { tipo: 'ACEITE_COM_RESSALVA' }),
    ).rejects.toThrow(OrcamentoValidacaoNaoEncontradoError);
  });
});
