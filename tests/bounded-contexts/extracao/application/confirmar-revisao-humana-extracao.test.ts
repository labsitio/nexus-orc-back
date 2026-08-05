import { describe, expect, it } from 'vitest';
import {
  CaminhoConfirmacaoInvalidoError,
  ConfirmarRevisaoHumanaExtracao,
  ExtracaoNaoEncontradaError,
  ExtracaoSemCondicoesComerciaisError,
} from '../../../../src/bounded-contexts/extracao/application/use-cases/confirmar-revisao-humana-extracao.js';
import {
  ExtracaoOrcamento,
  TransicaoInvalidaExtracaoError,
} from '../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
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
import type { ExtracaoOrcamentoRepository } from '../../../../src/bounded-contexts/extracao/domain/repositories/extracao-orcamento.repository.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/extracao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/extracao/domain/events/domain-event.js';
import { OrcamentoExtraido } from '../../../../src/bounded-contexts/extracao/domain/events/orcamento-extraido.event.js';
import { OrcamentoExtraidoComPendenciaConfirmada } from '../../../../src/bounded-contexts/extracao/domain/events/orcamento-extraido-pendencia-confirmada.event.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const ORCAMENTO_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const TENANT_ID = TenantId.novo();
const confiancaAlta = NivelConfianca.de(95);
const confiancaBaixa = NivelConfianca.de(20);

class RepositorioFake implements ExtracaoOrcamentoRepository {
  salvos: ExtracaoOrcamento[] = [];
  constructor(private existente: ExtracaoOrcamento | undefined) {}

  async buscarPorOrcamentoId(): Promise<ExtracaoOrcamento | undefined> {
    return this.existente;
  }

  async salvar(extracao: ExtracaoOrcamento): Promise<void> {
    this.salvos.push(extracao);
  }
}

class EventPublisherFake implements EventPublisher {
  publicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.publicados.push(evento);
  }
}

function condicoesCompletas(): CondicoesComerciais {
  return CondicoesComerciais.de({
    condicoesPagamento: CampoExtraido.extraido('30 dias', confiancaAlta, 'EXTRATOR'),
    prazoValidade: CampoExtraido.extraido(
      PeriodoValidade.de(new Date('2026-12-31')),
      confiancaAlta,
      'EXTRATOR',
    ),
    condicoesEntrega: CampoExtraido.extraido('FOB', confiancaAlta, 'EXTRATOR'),
  });
}

/** Extração já escalada para PENDENTE_REVISAO_HUMANA — precoUnitario do item 0 pendente. */
function extracaoPendente(tenantId: TenantId = TENANT_ID): ExtracaoOrcamento {
  const extracao = ExtracaoOrcamento.criar(
    OrcamentoId.de(ORCAMENTO_ID),
    ReferenciaClassificacao.de({
      fornecedorIdentificado: 'Fornecedor X',
      formatoIdentificado: 'PDF',
      agenteOrigem: 'CLASSIFICADOR',
    }),
    ReferenciaS3.de({ bucket: 'nexo-orcamentos-raw', key: 'portal/arquivo.pdf', versionId: 'v1' }),
    tenantId,
  );
  const itemIncompleto = ItemOrcamento.de({
    descricao: CampoExtraido.extraido(
      DescricaoProduto.de('Parafuso M6'),
      confiancaAlta,
      'EXTRATOR',
    ),
    quantidade: CampoExtraido.extraido(Quantidade.de(10), confiancaAlta, 'EXTRATOR'),
    precoUnitario: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
  });
  extracao.registrarTentativaExtrator([itemIncompleto], condicoesCompletas());
  return extracao;
}

function itemCompleto(): ItemOrcamento {
  return ItemOrcamento.de({
    descricao: CampoExtraido.extraido(
      DescricaoProduto.de('Parafuso M6'),
      confiancaAlta,
      'EXTRATOR',
    ),
    quantidade: CampoExtraido.extraido(Quantidade.de(10), confiancaAlta, 'EXTRATOR'),
    precoUnitario: CampoExtraido.extraido(Dinheiro.de(1099, 'BRL'), confiancaAlta, 'EXTRATOR'),
  });
}

/** Extração PENDENTE_REVISAO_HUMANA com itens completos, mas `prazoValidade` pendente. */
function extracaoPendenteCondicoesComerciais(tenantId: TenantId = TENANT_ID): ExtracaoOrcamento {
  const extracao = ExtracaoOrcamento.criar(
    OrcamentoId.de(ORCAMENTO_ID),
    ReferenciaClassificacao.de({
      fornecedorIdentificado: 'Fornecedor X',
      formatoIdentificado: 'PDF',
      agenteOrigem: 'CLASSIFICADOR',
    }),
    ReferenciaS3.de({ bucket: 'nexo-orcamentos-raw', key: 'portal/arquivo.pdf', versionId: 'v1' }),
    tenantId,
  );
  const condicoesIncompletas = CondicoesComerciais.de({
    condicoesPagamento: CampoExtraido.extraido('30 dias', confiancaAlta, 'EXTRATOR'),
    prazoValidade: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
    condicoesEntrega: CampoExtraido.extraido('FOB', confiancaAlta, 'EXTRATOR'),
  });
  extracao.registrarTentativaExtrator([itemCompleto()], condicoesIncompletas);
  return extracao;
}

describe('ConfirmarRevisaoHumanaExtracao', () => {
  it('lança ExtracaoNaoEncontradaError quando orcamentoId não existe', async () => {
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(undefined),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [
          {
            caminho: 'itens[0].precoUnitario',
            valor: { valorCentavos: 500, moeda: 'BRL' },
            indisponivel: false,
          },
        ],
      }),
    ).rejects.toThrow(ExtracaoNaoEncontradaError);
  });

  it('valor real fornecido pelo humano completa o campo → EXTRAIDO, publica OrcamentoExtraido', async () => {
    const extracao = extracaoPendente();
    const repositorio = new RepositorioFake(extracao);
    const publisher = new EventPublisherFake();
    const caso = new ConfirmarRevisaoHumanaExtracao(() => repositorio, publisher);

    await caso.executar({
      orcamentoId: ORCAMENTO_ID,
      tenantId: TENANT_ID,
      camposConfirmados: [
        {
          caminho: 'itens[0].precoUnitario',
          valor: { valorCentavos: 750, moeda: 'BRL' },
          indisponivel: false,
        },
      ],
    });

    expect(extracao.status).toBe('EXTRAIDO');
    expect(repositorio.salvos).toHaveLength(1);
    expect(publisher.publicados).toHaveLength(1);
    expect(publisher.publicados[0]).toBeInstanceOf(OrcamentoExtraido);
  });

  it('(issue #648) propaga o tenantId já presente no agregado para OrcamentoExtraido publicado', async () => {
    const tenantId = TenantId.de('01890a5d-ac96-774b-bcce-b302099a8057');
    const extracao = extracaoPendente(tenantId);
    const repositorio = new RepositorioFake(extracao);
    const publisher = new EventPublisherFake();
    const caso = new ConfirmarRevisaoHumanaExtracao(() => repositorio, publisher);

    await caso.executar({
      orcamentoId: ORCAMENTO_ID,
      tenantId,
      camposConfirmados: [
        {
          caminho: 'itens[0].precoUnitario',
          valor: { valorCentavos: 750, moeda: 'BRL' },
          indisponivel: false,
        },
      ],
    });

    const evento = publisher.publicados[0] as OrcamentoExtraido;
    expect(evento.tenantId).toBe(tenantId.toString());
  });

  it('(issue #648) propaga o tenantId já presente no agregado para OrcamentoExtraidoComPendenciaConfirmada publicado', async () => {
    const tenantId = TenantId.de('01890a5d-ac96-774b-bcce-b302099a8057');
    const extracao = extracaoPendente(tenantId);
    const publisher = new EventPublisherFake();
    const caso = new ConfirmarRevisaoHumanaExtracao(() => new RepositorioFake(extracao), publisher);

    await caso.executar({
      orcamentoId: ORCAMENTO_ID,
      tenantId,
      camposConfirmados: [{ caminho: 'itens[0].precoUnitario', valor: null, indisponivel: true }],
    });

    const evento = publisher.publicados[0] as OrcamentoExtraidoComPendenciaConfirmada;
    expect(evento.tenantId).toBe(tenantId.toString());
  });

  it('indisponibilidade confirmada → EXTRAIDO_COM_PENDENCIA_CONFIRMADA, publica OrcamentoExtraidoComPendenciaConfirmada', async () => {
    const extracao = extracaoPendente();
    const publisher = new EventPublisherFake();
    const caso = new ConfirmarRevisaoHumanaExtracao(() => new RepositorioFake(extracao), publisher);

    await caso.executar({
      orcamentoId: ORCAMENTO_ID,
      tenantId: TENANT_ID,
      camposConfirmados: [{ caminho: 'itens[0].precoUnitario', valor: null, indisponivel: true }],
    });

    expect(extracao.status).toBe('EXTRAIDO_COM_PENDENCIA_CONFIRMADA');
    expect(publisher.publicados[0]).toBeInstanceOf(OrcamentoExtraidoComPendenciaConfirmada);
    expect(extracao.itens[0]?.precoUnitario.extraido).toBe(false);
    expect(extracao.itens[0]?.precoUnitario.valor).toBeNull();
  });

  it('rejeita caminho para campo já extraído com sucesso (nunca reabre)', async () => {
    const extracao = extracaoPendente();
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [
          { caminho: 'itens[0].descricao', valor: { descricao: 'outro' }, indisponivel: false },
        ],
      }),
    ).rejects.toThrow(CaminhoConfirmacaoInvalidoError);
  });

  it('rejeita índice de item fora do intervalo', async () => {
    const extracao = extracaoPendente();
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [
          {
            caminho: 'itens[5].precoUnitario',
            valor: { valorCentavos: 1, moeda: 'BRL' },
            indisponivel: false,
          },
        ],
      }),
    ).rejects.toThrow(CaminhoConfirmacaoInvalidoError);
  });

  it('rejeita caminho em formato desconhecido', async () => {
    const extracao = extracaoPendente();
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [{ caminho: 'campo-inexistente', valor: 'x', indisponivel: false }],
      }),
    ).rejects.toThrow(CaminhoConfirmacaoInvalidoError);
  });

  it('rejeita status PENDENTE (Extrator ainda não tentou) com TransicaoInvalidaExtracaoError', async () => {
    const extracao = ExtracaoOrcamento.criar(
      OrcamentoId.de(ORCAMENTO_ID),
      ReferenciaClassificacao.de({
        fornecedorIdentificado: 'Fornecedor X',
        formatoIdentificado: 'PDF',
        agenteOrigem: 'CLASSIFICADOR',
      }),
      ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'portal/arquivo.pdf',
        versionId: 'v1',
      }),
      TENANT_ID,
    );
    // status PENDENTE: sem itens/condicoesComerciais ainda registrados pelo Extrator
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [
          {
            caminho: 'itens[0].precoUnitario',
            valor: { valorCentavos: 1, moeda: 'BRL' },
            indisponivel: false,
          },
        ],
      }),
    ).rejects.toThrow(TransicaoInvalidaExtracaoError);
  });

  it('rejeita status já resolvido (EXTRAIDO_COM_PENDENCIA_CONFIRMADA) com TransicaoInvalidaExtracaoError — nunca reconfirma', async () => {
    const extracao = extracaoPendente();
    extracao.registrarConfirmacaoHumana(extracao.itens, condicoesCompletas());
    expect(extracao.status).toBe('EXTRAIDO_COM_PENDENCIA_CONFIRMADA');

    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [
          {
            caminho: 'itens[0].precoUnitario',
            valor: { valorCentavos: 1, moeda: 'BRL' },
            indisponivel: false,
          },
        ],
      }),
    ).rejects.toThrow(TransicaoInvalidaExtracaoError);
  });

  it('rejeita valor com shape inválido (precoUnitario com moeda ausente) — nunca deixa TypeError vazar da borda', async () => {
    const extracao = extracaoPendente();
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [
          { caminho: 'itens[0].precoUnitario', valor: { valorCentavos: 100 }, indisponivel: false },
        ],
      }),
    ).rejects.toThrow(CaminhoConfirmacaoInvalidoError);
  });

  it('rejeita valor de tipo errado (precoUnitario como número solto em vez de objeto)', async () => {
    const extracao = extracaoPendente();
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [{ caminho: 'itens[0].precoUnitario', valor: 100, indisponivel: false }],
      }),
    ).rejects.toThrow(CaminhoConfirmacaoInvalidoError);
  });

  it('rejeita prazoValidade com data ISO inválida', async () => {
    const extracao = extracaoPendenteCondicoesComerciais();
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [
          {
            caminho: 'condicoesComerciais.prazoValidade',
            valor: 'não-é-uma-data',
            indisponivel: false,
          },
        ],
      }),
    ).rejects.toThrow(CaminhoConfirmacaoInvalidoError);
  });

  it('confirma descricao e quantidade pendentes de um item com valor real', async () => {
    const extracao = ExtracaoOrcamento.criar(
      OrcamentoId.de(ORCAMENTO_ID),
      ReferenciaClassificacao.de({
        fornecedorIdentificado: 'Fornecedor X',
        formatoIdentificado: 'PDF',
        agenteOrigem: 'CLASSIFICADOR',
      }),
      ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'portal/arquivo.pdf',
        versionId: 'v1',
      }),
      TENANT_ID,
    );
    const itemComDescricaoEQuantidadePendentes = ItemOrcamento.de({
      descricao: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
      quantidade: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
      precoUnitario: CampoExtraido.extraido(Dinheiro.de(1099, 'BRL'), confiancaAlta, 'EXTRATOR'),
    });
    extracao.registrarTentativaExtrator(
      [itemComDescricaoEQuantidadePendentes],
      condicoesCompletas(),
    );
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await caso.executar({
      orcamentoId: ORCAMENTO_ID,
      tenantId: TENANT_ID,
      camposConfirmados: [
        {
          caminho: 'itens[0].descricao',
          valor: { descricao: 'Parafuso M8', sku: 'PRF-M8' },
          indisponivel: false,
        },
        { caminho: 'itens[0].quantidade', valor: 25, indisponivel: false },
      ],
    });

    expect(extracao.status).toBe('EXTRAIDO');
  });

  it('confirma condicoesPagamento e condicoesEntrega pendentes com valor real', async () => {
    const extracao = ExtracaoOrcamento.criar(
      OrcamentoId.de(ORCAMENTO_ID),
      ReferenciaClassificacao.de({
        fornecedorIdentificado: 'Fornecedor X',
        formatoIdentificado: 'PDF',
        agenteOrigem: 'CLASSIFICADOR',
      }),
      ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'portal/arquivo.pdf',
        versionId: 'v1',
      }),
      TENANT_ID,
    );
    const condicoesIncompletas = CondicoesComerciais.de({
      condicoesPagamento: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
      prazoValidade: CampoExtraido.extraido(
        PeriodoValidade.de(new Date('2026-12-31')),
        confiancaAlta,
        'EXTRATOR',
      ),
      condicoesEntrega: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
    });
    extracao.registrarTentativaExtrator([itemCompleto()], condicoesIncompletas);
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await caso.executar({
      orcamentoId: ORCAMENTO_ID,
      tenantId: TENANT_ID,
      camposConfirmados: [
        {
          caminho: 'condicoesComerciais.condicoesPagamento',
          valor: '60 dias',
          indisponivel: false,
        },
        { caminho: 'condicoesComerciais.condicoesEntrega', valor: 'CIF', indisponivel: false },
      ],
    });

    expect(extracao.status).toBe('EXTRAIDO');
  });

  it('confirma prazoValidade pendente com data ISO válida', async () => {
    const extracao = extracaoPendenteCondicoesComerciais();
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracao),
      new EventPublisherFake(),
    );

    await caso.executar({
      orcamentoId: ORCAMENTO_ID,
      tenantId: TENANT_ID,
      camposConfirmados: [
        {
          caminho: 'condicoesComerciais.prazoValidade',
          valor: '2027-01-15T00:00:00.000Z',
          indisponivel: false,
        },
      ],
    });

    expect(extracao.status).toBe('EXTRAIDO');
  });

  it('lança ExtracaoSemCondicoesComerciaisError quando agregado está PENDENTE_REVISAO_HUMANA sem condicoesComerciais (invariante violada)', async () => {
    const extracaoInconsistente = ExtracaoOrcamento.reconstituir({
      orcamentoId: OrcamentoId.de(ORCAMENTO_ID),
      referenciaClassificacao: ReferenciaClassificacao.de({
        fornecedorIdentificado: 'Fornecedor X',
        formatoIdentificado: 'PDF',
        agenteOrigem: 'CLASSIFICADOR',
      }),
      referenciaBrutaS3: ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'portal/arquivo.pdf',
        versionId: 'v1',
      }),
      status: 'PENDENTE_REVISAO_HUMANA',
      itens: [itemCompleto()],
      condicoesComerciais: undefined,
      historico: [],
      tenantId: TENANT_ID,
    });
    const caso = new ConfirmarRevisaoHumanaExtracao(
      () => new RepositorioFake(extracaoInconsistente),
      new EventPublisherFake(),
    );

    await expect(
      caso.executar({
        orcamentoId: ORCAMENTO_ID,
        tenantId: TENANT_ID,
        camposConfirmados: [
          {
            caminho: 'condicoesComerciais.prazoValidade',
            valor: '2027-01-15T00:00:00.000Z',
            indisponivel: false,
          },
        ],
      }),
    ).rejects.toThrow(ExtracaoSemCondicoesComerciaisError);
  });
});
