import { describe, expect, it } from 'vitest';
import type { Logger } from 'pino';
import { ExtrairDadosOrcamento } from '../../../../src/bounded-contexts/extracao/application/use-cases/extrair-dados-orcamento.js';
import { ExtracaoOrcamento } from '../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
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
import type {
  AgenteExtratorGateway,
  AgenteExtratorInput,
  AgenteExtratorResultado,
} from '../../../../src/bounded-contexts/extracao/domain/gateways/agente-extrator.gateway.js';
import type { LeituraBrutaGateway } from '../../../../src/bounded-contexts/extracao/domain/gateways/leitura-bruta.gateway.js';
import type { MarkItDownConversaoExtracaoACL } from '../../../../src/bounded-contexts/extracao/domain/gateways/markitdown-conversao-extracao.acl.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/extracao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/extracao/domain/events/domain-event.js';
import type { ExtracaoOrcamentoRepository } from '../../../../src/bounded-contexts/extracao/domain/repositories/extracao-orcamento.repository.js';
import { OrcamentoExtraido } from '../../../../src/bounded-contexts/extracao/domain/events/orcamento-extraido.event.js';
import { ExtracaoEscalonadaParaRevisaoHumana } from '../../../../src/bounded-contexts/extracao/domain/events/extracao-escalonada-revisao-humana.event.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const AGENTE_EXTRATOR_ORIGEM = 'EXTRATOR' as const;
const ORCAMENTO_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

const PARAMS_BASE = {
  orcamentoId: ORCAMENTO_ID,
  referenciaClassificacao: {
    fornecedorIdentificado: 'Distribuidora ABC Ltda',
    formatoIdentificado: 'PDF_TABELA_PADRAO',
    agenteOrigem: 'CLASSIFICADOR' as const,
  },
  referenciaBrutaS3: {
    bucket: 'nexo-orcamentos-raw',
    key: 'portal/arquivo.pdf',
    versionId: 'v1',
  },
  tenantId: TenantId.novo(),
};

class RepositorioFake implements ExtracaoOrcamentoRepository {
  salvos: ExtracaoOrcamento[] = [];
  constructor(private existente: ExtracaoOrcamento | undefined = undefined) {}

  async buscarPorOrcamentoId(): Promise<ExtracaoOrcamento | undefined> {
    return this.existente;
  }

  async salvar(extracao: ExtracaoOrcamento): Promise<void> {
    this.salvos.push(extracao);
  }
}

class LeituraBrutaGatewayFake implements LeituraBrutaGateway {
  chamadas = 0;
  async ler(): Promise<Buffer> {
    this.chamadas++;
    return Buffer.from('conteúdo bruto simulado do orçamento');
  }
}

class MarkItDownConversaoExtracaoACLFake implements MarkItDownConversaoExtracaoACL {
  async converter(bruto: Buffer): Promise<string> {
    return bruto.toString('utf-8');
  }
}

class AgenteExtratorGatewayFake implements AgenteExtratorGateway {
  chamadas = 0;
  constructor(private readonly resultadoSimulado: AgenteExtratorResultado) {}

  async extrair(_input: AgenteExtratorInput): Promise<AgenteExtratorResultado> {
    this.chamadas++;
    return this.resultadoSimulado;
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

/** Captura as linhas de log EMF (T045/#110) sem depender de AWS — JSON puro. */
class LoggerFake {
  linhas: Record<string, unknown>[] = [];
  info(objeto: Record<string, unknown>): void {
    this.linhas.push(objeto);
  }
  error(): void {
    // Só as métricas (`info`) importam para os testes deste arquivo.
  }
}

function comoLogger(fake: LoggerFake): Logger {
  return fake as unknown as Logger;
}

class MarkItDownConversaoExtracaoACLFalhaFake implements MarkItDownConversaoExtracaoACL {
  async converter(): Promise<string> {
    throw new Error('Lambda MarkItDown retornou erro simulado');
  }
}

function itemCompleto(): ItemOrcamento {
  const confianca = NivelConfianca.de(94);
  return ItemOrcamento.de({
    descricao: CampoExtraido.extraido(
      DescricaoProduto.de('Caixa de papelão ondulado 40x30x20'),
      confianca,
      AGENTE_EXTRATOR_ORIGEM,
    ),
    quantidade: CampoExtraido.extraido(Quantidade.de(500), confianca, AGENTE_EXTRATOR_ORIGEM),
    precoUnitario: CampoExtraido.extraido(
      Dinheiro.de(320, 'BRL'),
      confianca,
      AGENTE_EXTRATOR_ORIGEM,
    ),
  });
}

function itemIncompleto(): ItemOrcamento {
  const confiancaAlta = NivelConfianca.de(94);
  const confiancaBaixa = NivelConfianca.de(20);
  return ItemOrcamento.de({
    descricao: CampoExtraido.extraido(
      DescricaoProduto.de('Caixa de papelão ondulado 40x30x20'),
      confiancaAlta,
      AGENTE_EXTRATOR_ORIGEM,
    ),
    quantidade: CampoExtraido.extraido(Quantidade.de(500), confiancaAlta, AGENTE_EXTRATOR_ORIGEM),
    precoUnitario: CampoExtraido.naoExtraido(confiancaBaixa, AGENTE_EXTRATOR_ORIGEM),
  });
}

function condicoesCompletas(): CondicoesComerciais {
  const confianca = NivelConfianca.de(88);
  return CondicoesComerciais.de({
    condicoesPagamento: CampoExtraido.extraido('30/60/90 dias', confianca, AGENTE_EXTRATOR_ORIGEM),
    prazoValidade: CampoExtraido.extraido(
      PeriodoValidade.de(new Date('2026-08-30')),
      confianca,
      AGENTE_EXTRATOR_ORIGEM,
    ),
    condicoesEntrega: CampoExtraido.extraido(
      'CIF, até 10 dias úteis',
      confianca,
      AGENTE_EXTRATOR_ORIGEM,
    ),
  });
}

describe('ExtrairDadosOrcamento', () => {
  it('cria o agregado, persiste e publica OrcamentoExtraido quando todo campo obrigatório tem confiança suficiente', async () => {
    const repositorio = new RepositorioFake();
    const publisher = new EventPublisherFake();
    const useCase = new ExtrairDadosOrcamento(
      () => repositorio,
      new LeituraBrutaGatewayFake(),
      new MarkItDownConversaoExtracaoACLFake(),
      new AgenteExtratorGatewayFake({
        itens: [itemCompleto()],
        condicoesComerciais: condicoesCompletas(),
      }),
      publisher,
    );

    await useCase.executar(PARAMS_BASE);

    expect(repositorio.salvos).toHaveLength(1);
    expect(repositorio.salvos[0]?.status).toBe('EXTRAIDO');
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as OrcamentoExtraido;
    expect(evento.detailType).toBe(OrcamentoExtraido.detailType);
    expect(evento.orcamentoId).toBe(ORCAMENTO_ID);
    expect(evento.itens).toHaveLength(1);
  });

  it('publica ExtracaoEscalonadaParaRevisaoHumana (sem valor inventado) quando 1+ campo obrigatório sem confiança', async () => {
    const repositorio = new RepositorioFake();
    const publisher = new EventPublisherFake();
    const useCase = new ExtrairDadosOrcamento(
      () => repositorio,
      new LeituraBrutaGatewayFake(),
      new MarkItDownConversaoExtracaoACLFake(),
      new AgenteExtratorGatewayFake({
        itens: [itemIncompleto()],
        condicoesComerciais: condicoesCompletas(),
      }),
      publisher,
    );

    await useCase.executar(PARAMS_BASE);

    expect(repositorio.salvos[0]?.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as ExtracaoEscalonadaParaRevisaoHumana;
    expect(evento.detailType).toBe(ExtracaoEscalonadaParaRevisaoHumana.detailType);
    expect(repositorio.salvos[0]?.itens[0]?.precoUnitario.valor).toBeNull();
  });

  it('recupera a extração existente (PENDENTE) em vez de criar outra, para a mesma referência', async () => {
    const existente = ExtracaoOrcamento.criar(
      OrcamentoId.de(ORCAMENTO_ID),
      ReferenciaClassificacao.de(PARAMS_BASE.referenciaClassificacao),
      ReferenciaS3.de(PARAMS_BASE.referenciaBrutaS3),
      PARAMS_BASE.tenantId,
    );
    const repositorio = new RepositorioFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new ExtrairDadosOrcamento(
      () => repositorio,
      new LeituraBrutaGatewayFake(),
      new MarkItDownConversaoExtracaoACLFake(),
      new AgenteExtratorGatewayFake({
        itens: [itemCompleto()],
        condicoesComerciais: condicoesCompletas(),
      }),
      publisher,
    );

    await useCase.executar(PARAMS_BASE);

    expect(repositorio.salvos).toHaveLength(1);
    expect(repositorio.salvos[0]).toBe(existente);
    expect(publisher.eventosPublicados).toHaveLength(1);
  });

  it('nunca reprocessa nem republica evento quando a extração já saiu de PENDENTE (entrega duplicada da fila)', async () => {
    const existente = ExtracaoOrcamento.criar(
      OrcamentoId.de(ORCAMENTO_ID),
      ReferenciaClassificacao.de(PARAMS_BASE.referenciaClassificacao),
      ReferenciaS3.de(PARAMS_BASE.referenciaBrutaS3),
      PARAMS_BASE.tenantId,
    );
    existente.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());
    const repositorio = new RepositorioFake(existente);
    const publisher = new EventPublisherFake();
    const leituraBruta = new LeituraBrutaGatewayFake();
    const agenteExtrator = new AgenteExtratorGatewayFake({
      itens: [itemCompleto()],
      condicoesComerciais: condicoesCompletas(),
    });
    const useCase = new ExtrairDadosOrcamento(
      () => repositorio,
      leituraBruta,
      new MarkItDownConversaoExtracaoACLFake(),
      agenteExtrator,
      publisher,
    );

    await useCase.executar(PARAMS_BASE);

    expect(leituraBruta.chamadas).toBe(0);
    expect(agenteExtrator.chamadas).toBe(0);
    expect(repositorio.salvos).toHaveLength(0);
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('(issue #648) propaga tenantId do params para o agregado criado e para OrcamentoExtraido publicado', async () => {
    const tenantId = TenantId.de('01890a5d-ac96-774b-bcce-b302099a8057');
    const repositorio = new RepositorioFake();
    const publisher = new EventPublisherFake();
    const useCase = new ExtrairDadosOrcamento(
      () => repositorio,
      new LeituraBrutaGatewayFake(),
      new MarkItDownConversaoExtracaoACLFake(),
      new AgenteExtratorGatewayFake({
        itens: [itemCompleto()],
        condicoesComerciais: condicoesCompletas(),
      }),
      publisher,
    );

    await useCase.executar({ ...PARAMS_BASE, tenantId });

    expect(repositorio.salvos[0]?.tenantId.toString()).toBe(tenantId.toString());
    const evento = publisher.eventosPublicados[0] as OrcamentoExtraido;
    expect(evento.tenantId).toBe(tenantId.toString());
  });

  it('(issue #648) retry com tenantId divergente nunca sobrescreve o tenantId já persistido no agregado existente (PENDENTE)', async () => {
    const tenantOriginal = TenantId.de('01890a5d-ac96-774b-bcce-b302099a8057');
    const tenantDivergente = TenantId.de('01890a5d-ac96-774b-bcce-b302099a9999');
    const existente = ExtracaoOrcamento.criar(
      OrcamentoId.de(ORCAMENTO_ID),
      ReferenciaClassificacao.de(PARAMS_BASE.referenciaClassificacao),
      ReferenciaS3.de(PARAMS_BASE.referenciaBrutaS3),
      tenantOriginal,
    );
    const repositorio = new RepositorioFake(existente);
    const publisher = new EventPublisherFake();
    const useCase = new ExtrairDadosOrcamento(
      () => repositorio,
      new LeituraBrutaGatewayFake(),
      new MarkItDownConversaoExtracaoACLFake(),
      new AgenteExtratorGatewayFake({
        itens: [itemCompleto()],
        condicoesComerciais: condicoesCompletas(),
      }),
      publisher,
    );

    await useCase.executar({ ...PARAMS_BASE, tenantId: tenantDivergente });

    expect(repositorio.salvos[0]?.tenantId.toString()).toBe(tenantOriginal.toString());
    const evento = publisher.eventosPublicados[0] as OrcamentoExtraido;
    expect(evento.tenantId).toBe(tenantOriginal.toString());
  });

  // (issue #656 — aperto de tipo) O teste de guarda fail-fast do ADR-008
  // (`ExtracaoSemTenantIdError`) foi removido: `ExtracaoOrcamento.criar` exige
  // `tenantId` desde o tipo, então o cenário de agregado legado sem tenantId
  // não é mais representável — a garantia agora vem do compilador.

  describe('métrica de observabilidade (T045/#110, ADR-016)', () => {
    it('emite CampoMarcadoNaoExtraido uma vez por campo obrigatório sem confiança suficiente', async () => {
      const repositorio = new RepositorioFake();
      const publisher = new EventPublisherFake();
      const loggerFake = new LoggerFake();
      const useCase = new ExtrairDadosOrcamento(
        () => repositorio,
        new LeituraBrutaGatewayFake(),
        new MarkItDownConversaoExtracaoACLFake(),
        new AgenteExtratorGatewayFake({
          itens: [itemIncompleto()],
          condicoesComerciais: condicoesCompletas(),
        }),
        publisher,
        comoLogger(loggerFake),
      );

      await useCase.executar(PARAMS_BASE);

      const metricas = loggerFake.linhas.filter(
        (linha) => linha.CampoMarcadoNaoExtraido !== undefined,
      );
      expect(metricas).toHaveLength(1);
      expect(metricas[0]?.campo).toBe('precoUnitario');
      expect((metricas[0] as { _aws: { CloudWatchMetrics: unknown[] } })._aws).toMatchObject({
        CloudWatchMetrics: [{ Namespace: 'Nexo/Extracao' }],
      });
    });

    it('não emite CampoMarcadoNaoExtraido quando todo campo obrigatório tem confiança suficiente', async () => {
      const repositorio = new RepositorioFake();
      const publisher = new EventPublisherFake();
      const loggerFake = new LoggerFake();
      const useCase = new ExtrairDadosOrcamento(
        () => repositorio,
        new LeituraBrutaGatewayFake(),
        new MarkItDownConversaoExtracaoACLFake(),
        new AgenteExtratorGatewayFake({
          itens: [itemCompleto()],
          condicoesComerciais: condicoesCompletas(),
        }),
        publisher,
        comoLogger(loggerFake),
      );

      await useCase.executar(PARAMS_BASE);

      expect(
        loggerFake.linhas.filter((linha) => linha.CampoMarcadoNaoExtraido !== undefined),
      ).toHaveLength(0);
    });

    it('emite ConversaoMarkItDownFalhou e propaga o erro quando o conversor falha', async () => {
      const repositorio = new RepositorioFake();
      const publisher = new EventPublisherFake();
      const loggerFake = new LoggerFake();
      const useCase = new ExtrairDadosOrcamento(
        () => repositorio,
        new LeituraBrutaGatewayFake(),
        new MarkItDownConversaoExtracaoACLFalhaFake(),
        new AgenteExtratorGatewayFake({
          itens: [itemCompleto()],
          condicoesComerciais: condicoesCompletas(),
        }),
        publisher,
        comoLogger(loggerFake),
      );

      await expect(useCase.executar(PARAMS_BASE)).rejects.toThrow(
        'Lambda MarkItDown retornou erro simulado',
      );

      const metricas = loggerFake.linhas.filter(
        (linha) => linha.ConversaoMarkItDownFalhou !== undefined,
      );
      expect(metricas).toHaveLength(1);
      expect(repositorio.salvos).toHaveLength(0);
      expect(publisher.eventosPublicados).toHaveLength(0);
    });
  });
});
