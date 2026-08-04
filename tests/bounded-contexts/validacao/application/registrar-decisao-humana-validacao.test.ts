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
import {
  PeriodoValidade,
  PeriodoValidadeInvalidoError,
} from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

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

function orcamentoPendenteRevisaoHumana(tenantId: TenantId = TenantId.novo()): OrcamentoValidacao {
  const validacao = OrcamentoValidacao.criar(ORCAMENTO_ID, dadosExtraidos(), tenantId);
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

  it('propaga tenantId do agregado para o evento publicado (issue #649)', async () => {
    const tenantId = TenantId.novo();
    const repositorio = new OrcamentoValidacaoRepositoryFake(
      orcamentoPendenteRevisaoHumana(tenantId),
    );
    const publisher = new EventPublisherFake();
    const useCase = new RegistrarDecisaoHumanaValidacao(repositorio, publisher);

    await useCase.executar(ORCAMENTO_ID.toString(), { tipo: 'ACEITE_COM_RESSALVA' });

    const evento = publisher.eventosPublicados[0] as OrcamentoValidadoComRessalva;
    expect(evento.tenantId).toBe(tenantId.toString());
  });
});

/**
 * T036 (#146) — `construirDecisao`: tradução do body HTTP para
 * `DecisaoHumanaValidacao`, movida do controller para a Application após
 * achado do `backend-reviewer` (orquestração de regra de negócio nunca é
 * responsabilidade da Interface).
 */
describe('RegistrarDecisaoHumanaValidacao.construirDecisao', () => {
  function orcamentoComCnpjInvalido(): OrcamentoValidacao {
    const dados = DadosExtraidosParaValidacao.de({
      cnpjFornecedor: '11111111111111',
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
    const validacao = OrcamentoValidacao.criar(ORCAMENTO_ID, dados);
    validacao.avaliarRegrasDeConsistencia([
      InconsistenciaDetectada.de('CNPJ_INVALIDO', 'dígito verificador incorreto'),
    ]);
    return validacao;
  }

  it('ACEITE_COM_RESSALVA carrega a justificativa, sem tocar dadosExtraidos', () => {
    const useCase = new RegistrarDecisaoHumanaValidacao(
      new OrcamentoValidacaoRepositoryFake(),
      new EventPublisherFake(),
    );

    const decisao = useCase.construirDecisao(orcamentoComCnpjInvalido(), {
      decisao: 'ACEITE_COM_RESSALVA',
      justificativa: 'Comprador aceita apesar do CNPJ divergente.',
    });

    expect(decisao).toEqual({
      tipo: 'ACEITE_COM_RESSALVA',
      justificativa: 'Comprador aceita apesar do CNPJ divergente.',
    });
  });

  it('CORRECAO_APLICADA com cnpjFornecedor corrigido limpa CNPJ_INVALIDO', () => {
    const useCase = new RegistrarDecisaoHumanaValidacao(
      new OrcamentoValidacaoRepositoryFake(),
      new EventPublisherFake(),
    );

    const decisao = useCase.construirDecisao(orcamentoComCnpjInvalido(), {
      decisao: 'CORRECAO_APLICADA',
      justificativa: 'CNPJ corrigido após contato com o fornecedor.',
      dadosCorrigidos: { cnpjFornecedor: '11222333000181' },
    });

    expect(decisao).toEqual({
      tipo: 'CORRECAO_APLICADA',
      justificativa: 'CNPJ corrigido após contato com o fornecedor.',
      inconsistencias: [],
    });
  });

  it('CORRECAO_APLICADA sem corrigir o campo relevante mantém a mesma inconsistência (nunca autoaprova)', () => {
    const useCase = new RegistrarDecisaoHumanaValidacao(
      new OrcamentoValidacaoRepositoryFake(),
      new EventPublisherFake(),
    );

    const decisao = useCase.construirDecisao(orcamentoComCnpjInvalido(), {
      decisao: 'CORRECAO_APLICADA',
      justificativa: 'Correção informada, mas não altera o CNPJ.',
      dadosCorrigidos: { condicoesComerciais: '30 dias' },
    });

    expect(decisao.tipo).toBe('CORRECAO_APLICADA');
    const inconsistenciasRecalculadas =
      decisao.tipo === 'CORRECAO_APLICADA' && decisao.inconsistencias;
    expect(inconsistenciasRecalculadas).toHaveLength(1);
    expect((inconsistenciasRecalculadas as InconsistenciaDetectada[])[0]?.regra).toBe(
      'CNPJ_INVALIDO',
    );
  });

  it('CORRECAO_APLICADA nunca descarta PRECO_FORA_DE_FAIXA/CNPJ_DIVERGENTE_CADASTRO (dependem de gateway, não recalculadas aqui)', () => {
    const dados = DadosExtraidosParaValidacao.de({
      cnpjFornecedor: '11222333000181',
      itens: [
        ItemParaValidacao.de({
          descricao: 'Item',
          quantidade: 1,
          precoUnitario: Dinheiro.de(1000, 'BRL'),
          extraido: true,
        }),
      ],
      condicoesComerciais: 'à vista',
      dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
      periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
    });
    const validacao = OrcamentoValidacao.criar(ORCAMENTO_ID, dados);
    const precoForaFaixa = InconsistenciaDetectada.de(
      'PRECO_FORA_DE_FAIXA',
      'preço unitário fora da faixa esperada',
    );
    validacao.avaliarRegrasDeConsistencia([precoForaFaixa]);

    const useCase = new RegistrarDecisaoHumanaValidacao(
      new OrcamentoValidacaoRepositoryFake(),
      new EventPublisherFake(),
    );

    const decisao = useCase.construirDecisao(validacao, {
      decisao: 'CORRECAO_APLICADA',
      justificativa: 'Corrigindo outro campo, não o preço.',
      dadosCorrigidos: { condicoesComerciais: '30 dias' },
    });

    expect(decisao.tipo === 'CORRECAO_APLICADA' && decisao.inconsistencias).toEqual([
      precoForaFaixa,
    ]);
  });

  it('CORRECAO_APLICADA com dadosCorrigidos.periodoValidade inválido lança PeriodoValidadeInvalidoError', () => {
    const useCase = new RegistrarDecisaoHumanaValidacao(
      new OrcamentoValidacaoRepositoryFake(),
      new EventPublisherFake(),
    );

    expect(() =>
      useCase.construirDecisao(orcamentoComCnpjInvalido(), {
        decisao: 'CORRECAO_APLICADA',
        justificativa: 'irrelevante',
        dadosCorrigidos: { periodoValidade: 'nao-e-data' },
      }),
    ).toThrow(PeriodoValidadeInvalidoError);
  });
});
