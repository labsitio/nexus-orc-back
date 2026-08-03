import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConsultarStatusValidacao } from '../../../../src/bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import { RegistrarDecisaoHumanaValidacao } from '../../../../src/bounded-contexts/validacao/application/use-cases/registrar-decisao-humana-validacao.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/validacao/domain/events/domain-event.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/validacao/domain/gateways/event-publisher.js';
import { OrcamentoValidacao } from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import type { OrcamentoValidacaoRepository } from '../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { InconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import { registrarRotaDecisaoHumanaValidacao } from '../../../../src/bounded-contexts/validacao/interface/http/decisao-humana.controller.js';

/** Contract test do controller real (T036/#146), fakes in-memory (sem Drizzle/EventBridge). */
class OrcamentoValidacaoRepositoryFake implements OrcamentoValidacaoRepository {
  private readonly registros = new Map<string, OrcamentoValidacao>();

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    this.registros.set(orcamentoValidacao.orcamentoId.toString(), orcamentoValidacao);
  }

  async buscarPorOrcamentoId(id: OrcamentoId): Promise<OrcamentoValidacao | undefined> {
    return this.registros.get(id.toString());
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

const dadosExtraidos = (cnpjFornecedor = '11222333000181') =>
  DadosExtraidosParaValidacao.de({
    cnpjFornecedor,
    itens: [
      ItemParaValidacao.de({
        descricao: 'Item',
        quantidade: 1,
        precoUnitario: Dinheiro.de(1000, 'BRL'),
        extraido: false,
      }),
    ],
    condicoesComerciais: 'à vista',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
  });

describe('POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: OrcamentoValidacaoRepositoryFake;
  let publisher: EventPublisherFake;

  beforeEach(() => {
    repositorio = new OrcamentoValidacaoRepositoryFake();
    publisher = new EventPublisherFake();
    app = Fastify();
    registrarRotaDecisaoHumanaValidacao(
      app,
      new RegistrarDecisaoHumanaValidacao(repositorio, publisher),
      new ConsultarStatusValidacao(repositorio),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 — CORRECAO_APLICADA corrige o CNPJ e transita para VALIDADO, publicando OrcamentoValidado', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');
    const validacao = OrcamentoValidacao.criar(id, dadosExtraidos('11111111111111'));
    validacao.avaliarRegrasDeConsistencia([
      InconsistenciaDetectada.de('CNPJ_INVALIDO', 'dígito verificador incorreto'),
    ]);
    await repositorio.salvar(validacao);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/validacao/decisao-humana`,
      payload: {
        decisao: 'CORRECAO_APLICADA',
        justificativa: 'CNPJ corrigido após contato com o fornecedor.',
        dadosCorrigidos: { cnpjFornecedor: '11222333000181' },
      },
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('VALIDADO');
    expect(corpo.historico.at(-1)).toMatchObject({
      resultado: 'VALIDADO',
      justificativa: 'CNPJ corrigido após contato com o fornecedor.',
    });
    expect(publisher.eventosPublicados).toHaveLength(1);
  });

  it('200 — ACEITE_COM_RESSALVA transita para VALIDADO_COM_RESSALVA, publicando OrcamentoValidadoComRessalva', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a2');
    const validacao = OrcamentoValidacao.criar(id, dadosExtraidos());
    validacao.avaliarRegrasDeConsistencia([
      InconsistenciaDetectada.de('PRAZO_INCOERENTE', 'prazo incoerente'),
    ]);
    await repositorio.salvar(validacao);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/validacao/decisao-humana`,
      payload: {
        decisao: 'ACEITE_COM_RESSALVA',
        justificativa: 'Comprador aceita apesar do prazo.',
      },
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('VALIDADO_COM_RESSALVA');
    expect(corpo.historico.at(-1)).toMatchObject({
      resultado: 'ACEITE_COM_RESSALVA',
      justificativa: 'Comprador aceita apesar do prazo.',
    });
    expect(publisher.eventosPublicados).toHaveLength(1);
  });

  it('409 Problem Details quando o status atual não é PENDENTE_REVISAO_HUMANA', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a3');
    await repositorio.salvar(OrcamentoValidacao.criar(id, dadosExtraidos()));

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/validacao/decisao-humana`,
      payload: { decisao: 'ACEITE_COM_RESSALVA', justificativa: 'irrelevante' },
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('404 Problem Details para orcamentoId inexistente', async () => {
    const idInexistente = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a4');

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${idInexistente.toString()}/validacao/decisao-humana`,
      payload: { decisao: 'ACEITE_COM_RESSALVA', justificativa: 'irrelevante' },
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('400 Problem Details quando CORRECAO_APLICADA vem sem dadosCorrigidos', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a5');
    const validacao = OrcamentoValidacao.criar(id, dadosExtraidos());
    validacao.avaliarRegrasDeConsistencia([
      InconsistenciaDetectada.de('PRAZO_INCOERENTE', 'prazo incoerente'),
    ]);
    await repositorio.salvar(validacao);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/validacao/decisao-humana`,
      payload: { decisao: 'CORRECAO_APLICADA', justificativa: 'sem dados corrigidos' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details quando dadosCorrigidos.periodoValidade não reconstrói um PeriodoValidade válido', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a7');
    const validacao = OrcamentoValidacao.criar(id, dadosExtraidos());
    validacao.avaliarRegrasDeConsistencia([
      InconsistenciaDetectada.de('PRAZO_INCOERENTE', 'prazo incoerente'),
    ]);
    await repositorio.salvar(validacao);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/validacao/decisao-humana`,
      payload: {
        decisao: 'CORRECAO_APLICADA',
        justificativa: 'periodoValidade corrigido incorretamente',
        dadosCorrigidos: { periodoValidade: 'nao-e-data' },
      },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details para body sem justificativa', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a6');

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${id.toString()}/validacao/decisao-humana`,
      payload: { decisao: 'ACEITE_COM_RESSALVA' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('400 Problem Details para orcamentoId mal formado', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/nao-e-uuid/validacao/decisao-humana',
      payload: { decisao: 'ACEITE_COM_RESSALVA', justificativa: 'irrelevante' },
    });

    expect(resposta.statusCode).toBe(400);
  });
});
