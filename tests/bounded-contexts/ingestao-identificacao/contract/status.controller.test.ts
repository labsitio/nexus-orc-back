import type { preHandlerHookHandler } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConsultarStatusOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/consultar-status-orcamento.js';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { ResultadoClassificacao } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { criarTenantContext } from '../../../../src/shared-kernel/tenant/tenant-context.js';
import { registrarRotaStatusOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/status.controller.js';

/** Contract test do controller real (T047/#52), fake repository (sem Drizzle/#16). */
class OrcamentoRepositoryFake implements OrcamentoRepository {
  private readonly registros = new Map<string, Orcamento>();

  async salvar(orcamento: Orcamento): Promise<void> {
    this.registros.set(orcamento.id.toString(), orcamento);
  }

  async buscarPorId(id: OrcamentoId): Promise<Orcamento | undefined> {
    return this.registros.get(id.toString());
  }
}

function criarReferenciaBruta(): ReferenciaS3 {
  return ReferenciaS3.de({
    bucket: 'nexo-orcamentos-raw',
    key: 'portal-web/2026/07/30/orcamento.pdf',
    versionId: 'v1',
  });
}

/** (spec 007, T017) PreHandler fake que injeta tenantContext nos testes. */
function criarPreHandlerFakeTenant(tenantId: TenantId): preHandlerHookHandler {
  return async (request) => {
    request.tenantContext = criarTenantContext(tenantId);
  };
}

describe('GET /v1/orcamentos/{orcamentoId}/status — controller', () => {
  let app: ReturnType<typeof Fastify>;
  let repositorio: OrcamentoRepositoryFake;
  let tenantIdTeste: TenantId;

  beforeEach(() => {
    repositorio = new OrcamentoRepositoryFake();
    tenantIdTeste = TenantId.novo();
    app = Fastify();
    registrarRotaStatusOrcamento(app, new ConsultarStatusOrcamento(repositorio), {
      preHandler: criarPreHandlerFakeTenant(tenantIdTeste),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 RECEBIDO', async () => {
    const id = OrcamentoId.novo();
    await repositorio.salvar(
      Orcamento.receber({
        id,
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
        tenantId: tenantIdTeste,
      }),
    );

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/status`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      orcamentoId: id.toString(),
      canal: 'PORTAL_WEB',
      status: 'RECEBIDO',
      resultadoAtual: null,
      historico: [],
    });
  });

  it('200 CLASSIFICADO — inclui resultado e histórico com agente', async () => {
    const id = OrcamentoId.novo();
    const orcamento = Orcamento.receber({
      id,
      canal: Canal.de('API_REST'),
      referenciaBruta: criarReferenciaBruta(),
      tenantId: tenantIdTeste,
    });
    orcamento.registrarTentativaClassificador(
      ResultadoClassificacao.criar({
        fornecedorIdentificado: 'Distribuidora ABC Ltda',
        formatoIdentificado: 'PDF_TABELA_PADRAO',
        nivelConfianca: NivelConfianca.de(92),
        agenteOrigem: 'CLASSIFICADOR',
      }),
    );
    await repositorio.salvar(orcamento);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('CLASSIFICADO');
    expect(corpo.resultadoAtual.fornecedorIdentificado).toBe('Distribuidora ABC Ltda');
    expect(corpo.historico).toHaveLength(1);
    expect(corpo.historico[0].agente).toBe('CLASSIFICADOR');
  });

  it('200 PENDENTE_REVISAO_HUMANA', async () => {
    const id = OrcamentoId.novo();
    const orcamento = Orcamento.receber({
      id,
      canal: Canal.de('SFTP'),
      referenciaBruta: criarReferenciaBruta(),
      tenantId: tenantIdTeste,
    });
    orcamento.registrarTentativaClassificador(
      ResultadoClassificacao.criar({
        fornecedorIdentificado: 'Fornecedor Provável Ltda',
        formatoIdentificado: 'PDF_TABELA_PADRAO',
        nivelConfianca: NivelConfianca.de(62),
        agenteOrigem: 'CLASSIFICADOR',
      }),
    );
    await repositorio.salvar(orcamento);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(corpo.resultadoAtual).toMatchObject({
      nivelConfianca: 62,
      agenteOrigem: 'CLASSIFICADOR',
    });
    expect(corpo.historico).toHaveLength(1);
    expect(corpo.historico[0]).toMatchObject({
      agente: 'CLASSIFICADOR',
      resultado: { nivelConfianca: 62 },
    });
  });

  it('200 PENDENTE_REVISAO_HUMANA seguido de confirmação humana — histórico do Classificador preservado', async () => {
    const id = OrcamentoId.novo();
    const orcamento = Orcamento.receber({
      id,
      canal: Canal.de('API_REST'),
      referenciaBruta: criarReferenciaBruta(),
      tenantId: tenantIdTeste,
    });
    orcamento.registrarTentativaClassificador(
      ResultadoClassificacao.criar({
        fornecedorIdentificado: 'Fornecedor Incerto',
        formatoIdentificado: 'PLANILHA_XLSX',
        nivelConfianca: NivelConfianca.de(40),
        agenteOrigem: 'CLASSIFICADOR',
      }),
    );
    orcamento.registrarConfirmacaoHumana(
      ResultadoClassificacao.criar({
        fornecedorIdentificado: 'Distribuidora ABC Ltda',
        formatoIdentificado: 'PDF_TABELA_PADRAO',
        nivelConfianca: NivelConfianca.de(100),
        agenteOrigem: 'HUMANO',
      }),
    );
    await repositorio.salvar(orcamento);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${id.toString()}/status`,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.status).toBe('CLASSIFICADO');
    expect(corpo.historico).toHaveLength(2);
    expect(corpo.historico[0]).toMatchObject({
      agente: 'CLASSIFICADOR',
      resultado: { nivelConfianca: 40, fornecedorIdentificado: 'Fornecedor Incerto' },
    });
    expect(corpo.historico[1]).toMatchObject({
      agente: 'HUMANO',
      resultado: { nivelConfianca: 100, fornecedorIdentificado: 'Distribuidora ABC Ltda' },
    });
  });

  it('404 Problem Details para orcamentoId inexistente', async () => {
    const idInexistente = OrcamentoId.novo();

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idInexistente.toString()}/status`,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(resposta.json()).toMatchObject({ status: 404 });
  });

  it('400 Problem Details para orcamentoId mal formado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/orcamentos/nao-e-uuid/status',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('propaga (500) erro inesperado do repositório sem mascarar como 404', async () => {
    const appComRepositorioQuebrado = Fastify();
    const repositorioQuebrado: OrcamentoRepository = {
      salvar: () => {
        throw new Error('não usado neste teste');
      },
      buscarPorId: () => {
        throw new Error('falha inesperada de infraestrutura');
      },
    };
    registrarRotaStatusOrcamento(
      appComRepositorioQuebrado,
      new ConsultarStatusOrcamento(repositorioQuebrado),
      { preHandler: criarPreHandlerFakeTenant(tenantIdTeste) },
    );

    const resposta = await appComRepositorioQuebrado.inject({
      method: 'GET',
      url: `/v1/orcamentos/${OrcamentoId.novo().toString()}/status`,
    });

    expect(resposta.statusCode).toBe(500);
    await appComRepositorioQuebrado.close();
  });
});
