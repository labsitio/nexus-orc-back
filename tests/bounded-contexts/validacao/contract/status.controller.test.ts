import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConsultarStatusValidacao } from '../../../../src/bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import { OrcamentoValidacao } from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import type { OrcamentoValidacaoRepository } from '../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { InconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import { registrarRotaStatusValidacao } from '../../../../src/bounded-contexts/validacao/interface/http/status.controller.js';

/** Contract test do controller real (T026/#136), fake repository (sem Drizzle). */
class OrcamentoValidacaoRepositoryFake implements OrcamentoValidacaoRepository {
  private readonly registros = new Map<string, OrcamentoValidacao>();

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    this.registros.set(orcamentoValidacao.orcamentoId.toString(), orcamentoValidacao);
  }

  async buscarPorOrcamentoId(id: OrcamentoId): Promise<OrcamentoValidacao | undefined> {
    return this.registros.get(id.toString());
  }
}

const dadosExtraidos = () =>
  DadosExtraidosParaValidacao.de({
    cnpjFornecedor: '11222333000181',
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

describe('GET /v1/orcamentos/{orcamentoId}/validacao/status — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: OrcamentoValidacaoRepositoryFake;

  beforeEach(() => {
    repositorio = new OrcamentoValidacaoRepositoryFake();
    app = Fastify();
    registrarRotaStatusValidacao(app, new ConsultarStatusValidacao(repositorio));
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 PENDENTE — sem inconsistências ainda, histórico vazio', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');
    await repositorio.salvar(OrcamentoValidacao.criar(id, dadosExtraidos()));

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      orcamentoId: id.toString(),
      status: 'PENDENTE',
      inconsistencias: [],
      historico: [],
    });
  });

  it('200 VALIDADO — todas as regras passaram na mesma tentativa', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a2');
    const orcamentoValidacao = OrcamentoValidacao.criar(id, dadosExtraidos());
    orcamentoValidacao.avaliarRegrasDeConsistencia([]);
    await repositorio.salvar(orcamentoValidacao);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('VALIDADO');
    expect(corpo.historico).toHaveLength(1);
    expect(corpo.historico[0]).toMatchObject({ resultado: 'VALIDADO', inconsistencias: [] });
  });

  it('200 PENDENTE_REVISAO_HUMANA — inconsistência identifica a regra específica que falhou', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a3');
    const orcamentoValidacao = OrcamentoValidacao.criar(id, dadosExtraidos());
    const inconsistencia = InconsistenciaDetectada.de(
      'CNPJ_INVALIDO',
      'CNPJ do fornecedor com dígito verificador incorreto',
    );
    orcamentoValidacao.avaliarRegrasDeConsistencia([inconsistencia]);
    await repositorio.salvar(orcamentoValidacao);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(corpo.inconsistencias).toEqual([
      { regra: 'CNPJ_INVALIDO', detalhe: 'CNPJ do fornecedor com dígito verificador incorreto' },
    ]);
    expect(corpo.historico).toHaveLength(1);
    expect(corpo.historico[0].resultado).toBe('INCONSISTENTE');
  });

  it('200 VALIDADO_COM_RESSALVA — decisão humana explícita registrada no histórico', async () => {
    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a4');
    const orcamentoValidacao = OrcamentoValidacao.criar(id, dadosExtraidos());
    const inconsistencia = InconsistenciaDetectada.de(
      'PRAZO_INCOERENTE',
      'prazo de validade anterior à data de emissão da proposta',
    );
    orcamentoValidacao.avaliarRegrasDeConsistencia([inconsistencia]);
    orcamentoValidacao.registrarDecisaoHumana({ tipo: 'ACEITE_COM_RESSALVA' });
    await repositorio.salvar(orcamentoValidacao);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('VALIDADO_COM_RESSALVA');
    expect(corpo.historico).toHaveLength(2);
    expect(corpo.historico[1].resultado).toBe('ACEITE_COM_RESSALVA');
  });

  it('404 Problem Details para orcamentoId inexistente', async () => {
    const idInexistente = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a5');

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idInexistente.toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.json()).toMatchObject({ status: 404 });
  });

  it('400 Problem Details para orcamentoId mal formado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/orcamentos/nao-e-uuid/validacao/status',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('propaga (500) erro inesperado do repositório sem mascarar como 404', async () => {
    const appComRepositorioQuebrado = Fastify();
    const repositorioQuebrado: OrcamentoValidacaoRepository = {
      salvar: () => {
        throw new Error('não usado neste teste');
      },
      buscarPorOrcamentoId: () => {
        throw new Error('falha inesperada de infraestrutura');
      },
    };
    registrarRotaStatusValidacao(
      appComRepositorioQuebrado,
      new ConsultarStatusValidacao(repositorioQuebrado),
    );

    const resposta = await appComRepositorioQuebrado.inject({
      method: 'GET',
      url: `/v1/orcamentos/${OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a6').toString()}/validacao/status`,
    });

    expect(resposta.statusCode).toBe(500);
    await appComRepositorioQuebrado.close();
  });
});
