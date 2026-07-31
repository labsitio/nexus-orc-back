import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConsultarStatusExtracao } from '../../../../src/bounded-contexts/extracao/application/use-cases/consultar-status-extracao.js';
import { ExtracaoOrcamento } from '../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
import type { ExtracaoOrcamentoRepository } from '../../../../src/bounded-contexts/extracao/domain/repositories/extracao-orcamento.repository.js';
import { CampoExtraido } from '../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../../../../src/bounded-contexts/extracao/domain/value-objects/condicoes-comerciais.vo.js';
import { DescricaoProduto } from '../../../../src/bounded-contexts/extracao/domain/value-objects/descricao-produto.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/extracao/domain/value-objects/dinheiro.vo.js';
import { ItemOrcamento } from '../../../../src/bounded-contexts/extracao/domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/extracao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/extracao/domain/value-objects/periodo-validade.vo.js';
import { Quantidade } from '../../../../src/bounded-contexts/extracao/domain/value-objects/quantidade.vo.js';
import { ReferenciaClassificacao } from '../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-classificacao.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-s3.vo.js';
import { registrarRotaStatusExtracao } from '../../../../src/bounded-contexts/extracao/interface/http/status.controller.js';

/** Contract test do controller real (T024/#89), fake repository (sem Drizzle). */
class ExtracaoOrcamentoRepositoryFake implements ExtracaoOrcamentoRepository {
  private readonly registros = new Map<string, ExtracaoOrcamento>();

  async salvar(extracao: ExtracaoOrcamento): Promise<void> {
    this.registros.set(extracao.orcamentoId.toString(), extracao);
  }

  async buscarPorOrcamentoId(id: OrcamentoId): Promise<ExtracaoOrcamento | undefined> {
    return this.registros.get(id.toString());
  }
}

/** Extração nunca gera `OrcamentoId` (só reutiliza, `OrcamentoId.de`) — fabrica um UUID v7-shaped para teste. */
function novoIdV7(): OrcamentoId {
  const base = randomUUID();
  const variante = '89ab'[Math.floor(Math.random() * 4)];
  const v7 = `${base.slice(0, 14)}7${base.slice(15, 19)}${variante}${base.slice(20)}`;
  return OrcamentoId.de(v7);
}

const confiancaAlta = NivelConfianca.de(95);

function novaExtracao(id: OrcamentoId): ExtracaoOrcamento {
  return ExtracaoOrcamento.criar(
    id,
    ReferenciaClassificacao.de({
      fornecedorIdentificado: 'Distribuidora ABC Ltda',
      formatoIdentificado: 'PDF',
      agenteOrigem: 'CLASSIFICADOR',
    }),
    ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'portal-web/2026/07/30/orcamento.pdf',
      versionId: 'v1',
    }),
  );
}

function itemCompleto(): ItemOrcamento {
  return ItemOrcamento.de({
    descricao: CampoExtraido.extraido(
      DescricaoProduto.de('Caixa de papelão ondulado 40x30x20'),
      confiancaAlta,
      'EXTRATOR',
    ),
    quantidade: CampoExtraido.extraido(Quantidade.de(500), confiancaAlta, 'EXTRATOR'),
    precoUnitario: CampoExtraido.extraido(Dinheiro.de(320, 'BRL'), confiancaAlta, 'EXTRATOR'),
  });
}

function condicoesCompletas(): CondicoesComerciais {
  return CondicoesComerciais.de({
    condicoesPagamento: CampoExtraido.extraido('30/60/90 dias', confiancaAlta, 'EXTRATOR'),
    prazoValidade: CampoExtraido.extraido(
      PeriodoValidade.de(new Date('2026-08-30')),
      confiancaAlta,
      'EXTRATOR',
    ),
    condicoesEntrega: CampoExtraido.extraido('CIF, até 10 dias úteis', confiancaAlta, 'EXTRATOR'),
  });
}

describe('GET /v1/orcamentos/{orcamentoId}/extracao/status — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: ExtracaoOrcamentoRepositoryFake;

  beforeEach(() => {
    repositorio = new ExtracaoOrcamentoRepositoryFake();
    app = Fastify();
    registrarRotaStatusExtracao(app, new ConsultarStatusExtracao(repositorio));
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 PENDENTE — sem itens nem condições ainda', async () => {
    const id = novoIdV7();
    await repositorio.salvar(novaExtracao(id));

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/extracao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      orcamentoId: id.toString(),
      status: 'PENDENTE',
      itens: [],
      condicoesComerciais: null,
      historico: [],
    });
  });

  it('200 EXTRAIDO — itens e condições comerciais completos', async () => {
    const id = novoIdV7();
    const extracao = novaExtracao(id);
    extracao.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());
    await repositorio.salvar(extracao);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/extracao/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('EXTRAIDO');
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.itens[0].precoUnitario.valor).toEqual({ valorCentavos: 320, moeda: 'BRL' });
    expect(corpo.condicoesComerciais.condicoesPagamento.valor).toBe('30/60/90 dias');
    expect(corpo.historico).toHaveLength(1);
    expect(corpo.historico[0]).toMatchObject({ agente: 'EXTRATOR', resultado: 'EXTRAIDO' });
  });

  it('404 Problem Details para orcamentoId inexistente', async () => {
    const idInexistente = novoIdV7();

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idInexistente.toString()}/extracao/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.json()).toMatchObject({ status: 404 });
  });

  it('400 Problem Details para orcamentoId mal formado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/orcamentos/nao-e-uuid/extracao/status',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('propaga (500) erro inesperado do repositório sem mascarar como 404', async () => {
    const appComRepositorioQuebrado = Fastify();
    const repositorioQuebrado: ExtracaoOrcamentoRepository = {
      salvar: () => {
        throw new Error('não usado neste teste');
      },
      buscarPorOrcamentoId: () => {
        throw new Error('falha inesperada de infraestrutura');
      },
    };
    registrarRotaStatusExtracao(
      appComRepositorioQuebrado,
      new ConsultarStatusExtracao(repositorioQuebrado),
    );

    const resposta = await appComRepositorioQuebrado.inject({
      method: 'GET',
      url: `/v1/orcamentos/${novoIdV7().toString()}/extracao/status`,
    });

    expect(resposta.statusCode).toBe(500);
    await appComRepositorioQuebrado.close();
  });
});
