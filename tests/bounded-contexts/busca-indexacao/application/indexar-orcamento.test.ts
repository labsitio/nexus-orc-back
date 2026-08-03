import { describe, expect, it } from 'vitest';
import {
  IndexarOrcamento,
  IndexarOrcamentoInvalidoError,
} from '../../../../src/bounded-contexts/busca-indexacao/application/use-cases/indexar-orcamento.js';
import { IndiceOrcamento } from '../../../../src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.js';
import type { AgenteEmbeddingGateway } from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/agente-embedding.gateway.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/event-publisher.js';
import type {
  OrcamentoValidadoEventACL,
  OrcamentoValidadoEventACLResultado,
  OrcamentoValidadoEventDetailType,
} from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/orcamento-validado-event.acl.js';
import type { IndiceOrcamentoRepository } from '../../../../src/bounded-contexts/busca-indexacao/domain/repositories/indice-orcamento.repository.js';
import type { CriterioBusca } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/criterio-busca.vo.js';
import { ConteudoIndexavel } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/conteudo-indexavel.vo.js';
import { Embedding } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/busca-indexacao/domain/events/domain-event.js';
import { FalhaIndexacaoDetectada } from '../../../../src/bounded-contexts/busca-indexacao/domain/events/falha-indexacao-detectada.event.js';
import { OrcamentoIndexado } from '../../../../src/bounded-contexts/busca-indexacao/domain/events/orcamento-indexado.event.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/origem-validacao.vo.js';
import type { Embedding as EmbeddingVO } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import type { ResultadoBusca } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/resultado-busca.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * T029 (#189) — Unit test do caso de uso `IndexarOrcamento`: idempotência no
 * retry (upsert por `orcamentoId`, agregado recuperado quando já existe),
 * invariante "só transita para INDEXADO com embedding gerado e persistido na
 * mesma tentativa", falha técnica publica `FalhaIndexacaoDetectada` sem
 * relançar (não bloqueia o processamento do lote), e histórico nunca
 * sobrescrito entre chamadas.
 */

const TENANT_ID = TenantId.de('018f5b3a-9999-7abc-89ab-0123456789ab');
const ORCAMENTO_ID = OrcamentoId.de('018f5b3a-1111-7abc-89ab-0123456789ab');

class AclFake implements OrcamentoValidadoEventACL {
  chamadas: { detailType: OrcamentoValidadoEventDetailType; payloadBruto: unknown }[] = [];
  constructor(private readonly resultado: OrcamentoValidadoEventACLResultado) {}

  traduzir(
    detailType: OrcamentoValidadoEventDetailType,
    payloadBruto: unknown,
  ): OrcamentoValidadoEventACLResultado {
    this.chamadas.push({ detailType, payloadBruto });
    return this.resultado;
  }
}

class EmbeddingGatewayFake implements AgenteEmbeddingGateway {
  chamadas: string[] = [];
  private erro: Error | undefined;
  private embedding: EmbeddingVO | undefined;

  configurarSucesso(embedding: EmbeddingVO): void {
    this.embedding = embedding;
    this.erro = undefined;
  }

  configurarFalha(erro: Error): void {
    this.erro = erro;
    this.embedding = undefined;
  }

  async gerarEmbedding(texto: string): Promise<EmbeddingVO> {
    this.chamadas.push(texto);
    if (this.erro) {
      throw this.erro;
    }
    return this.embedding!;
  }
}

class RepositorioFake implements IndiceOrcamentoRepository {
  chamadasUpsert: IndiceOrcamento[] = [];
  private armazenado: IndiceOrcamento | undefined;
  private erroNaProximaChamada: Error | undefined;

  definirExistente(indice: IndiceOrcamento | undefined): void {
    this.armazenado = indice;
  }

  falharNaProximaChamada(erro: Error): void {
    this.erroNaProximaChamada = erro;
  }

  async upsert(indiceOrcamento: IndiceOrcamento): Promise<void> {
    if (this.erroNaProximaChamada) {
      const erro = this.erroNaProximaChamada;
      this.erroNaProximaChamada = undefined;
      throw erro;
    }
    this.chamadasUpsert.push(indiceOrcamento);
    this.armazenado = indiceOrcamento;
  }

  async buscarPorOrcamentoId(): Promise<IndiceOrcamento | undefined> {
    return this.armazenado;
  }

  async buscarPorCriterioEVetor(
    _criterio: CriterioBusca,
    _vetorConsulta: EmbeddingVO | undefined,
    _limite: number,
  ): Promise<readonly ResultadoBusca[]> {
    throw new Error(
      'IndexarOrcamento nunca busca — buscarPorCriterioEVetor não deveria ser chamado',
    );
  }
}

class EventPublisherFake implements EventPublisher {
  eventos: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventos.push(evento);
  }
}

function conteudoFixture(): ConteudoIndexavel {
  return ConteudoIndexavel.de({
    resumoFornecedor: 'Fornecedor Acme',
    itensDescricao: ['Parafuso sextavado M8'],
    condicoesResumo: 'Pagamento em 30 dias',
    categorias: ['ferragens'],
  });
}

function embeddingFixture(): EmbeddingVO {
  return Embedding.de({
    vetor: new Array(4).fill(0.1),
    dimensao: 4,
    modeloId: 'amazon.titan-embed-text-v2:0',
    geradoEm: new Date('2026-01-10T00:00:00.000Z'),
  });
}

function montarCaso() {
  const aclResultado: OrcamentoValidadoEventACLResultado = {
    orcamentoId: ORCAMENTO_ID,
    conteudoIndexavel: conteudoFixture(),
    origemValidacao: OrigemValidacao.de('VALIDADO'),
  };
  const acl = new AclFake(aclResultado);
  const embeddingGateway = new EmbeddingGatewayFake();
  const repositorio = new RepositorioFake();
  const eventPublisher = new EventPublisherFake();
  const useCase = new IndexarOrcamento(acl, embeddingGateway, repositorio, eventPublisher);
  return { acl, embeddingGateway, repositorio, eventPublisher, useCase };
}

describe('IndexarOrcamento', () => {
  it('exige tenantId — lança erro de domínio quando ausente, mesmo contornando o tipo em runtime', async () => {
    const { useCase } = montarCaso();

    await expect(useCase.executar(undefined as never, 'OrcamentoValidado', {})).rejects.toThrow(
      IndexarOrcamentoInvalidoError,
    );
  });

  it('gera embedding, transita para INDEXADO, persiste via upsert e publica OrcamentoIndexado', async () => {
    const { embeddingGateway, repositorio, eventPublisher, useCase } = montarCaso();
    embeddingGateway.configurarSucesso(embeddingFixture());

    await useCase.executar(TENANT_ID, 'OrcamentoValidado', { qualquer: 'coisa' });

    expect(repositorio.chamadasUpsert).toHaveLength(1);
    const persistido = repositorio.chamadasUpsert[0]!;
    expect(persistido.estado).toBe('INDEXADO');
    expect(persistido.embedding).toBeDefined();
    expect(persistido.historico).toHaveLength(1);

    expect(eventPublisher.eventos).toHaveLength(1);
    const evento = eventPublisher.eventos[0]! as OrcamentoIndexado;
    expect(evento).toBeInstanceOf(OrcamentoIndexado);
    expect(evento.orcamentoId).toBe(ORCAMENTO_ID.toString());
    expect(evento.tenantId).toBe(TENANT_ID.toString());
    expect(evento.modeloEmbedding).toBe('amazon.titan-embed-text-v2:0');
  });

  it('nunca transita para INDEXADO sem embedding — falha do AgenteEmbeddingGateway registra FALHA_TECNICA, persiste e publica FalhaIndexacaoDetectada sem relançar', async () => {
    const { embeddingGateway, repositorio, eventPublisher, useCase } = montarCaso();
    embeddingGateway.configurarFalha(new Error('serviço de embeddings indisponível'));

    await expect(
      useCase.executar(TENANT_ID, 'OrcamentoValidado', { qualquer: 'coisa' }),
    ).resolves.toBeUndefined();

    const persistido = repositorio.chamadasUpsert[0]!;
    expect(persistido.estado).toBe('FALHA_INDEXACAO');
    expect(persistido.embedding).toBeUndefined();
    expect(persistido.historico).toHaveLength(1);

    expect(eventPublisher.eventos).toHaveLength(1);
    const evento = eventPublisher.eventos[0]! as FalhaIndexacaoDetectada;
    expect(evento).toBeInstanceOf(FalhaIndexacaoDetectada);
    expect(evento.motivoFalha).toBe('serviço de embeddings indisponível');
    expect(evento.tentativaNumero).toBe(1);
  });

  it('idempotência de retry: recupera o agregado já persistido por orcamentoId em vez de criar um novo, e anexa ao histórico existente sem sobrescrevê-lo', async () => {
    const { embeddingGateway, repositorio, useCase } = montarCaso();

    const indiceComFalhaAnterior = IndiceOrcamento.criar({
      orcamentoId: ORCAMENTO_ID,
      tenantId: TENANT_ID,
      conteudoIndexavel: conteudoFixture(),
      origemValidacao: OrigemValidacao.de('VALIDADO'),
    });
    indiceComFalhaAnterior.registrarTentativaIndexacao({
      resultado: 'FALHA_TECNICA',
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      motivoFalha: 'timeout na primeira tentativa',
    });
    repositorio.definirExistente(indiceComFalhaAnterior);
    embeddingGateway.configurarSucesso(embeddingFixture());

    await useCase.executar(TENANT_ID, 'OrcamentoValidado', { qualquer: 'coisa' });

    const persistido = repositorio.chamadasUpsert[0]!;
    expect(persistido.estado).toBe('INDEXADO');
    expect(persistido.historico).toHaveLength(2);
    expect(persistido.historico[0]!.resultado).toBe('FALHA_TECNICA');
    expect(persistido.historico[0]!.motivoFalha).toBe('timeout na primeira tentativa');
    expect(persistido.historico[1]!.resultado).toBe('INDEXADO');
  });

  it('numera tentativaNumero de FalhaIndexacaoDetectada pela posição real no histórico (2ª tentativa após falha anterior)', async () => {
    const { embeddingGateway, eventPublisher, repositorio, useCase } = montarCaso();

    const indiceComFalhaAnterior = IndiceOrcamento.criar({
      orcamentoId: ORCAMENTO_ID,
      tenantId: TENANT_ID,
      conteudoIndexavel: conteudoFixture(),
      origemValidacao: OrigemValidacao.de('VALIDADO'),
    });
    indiceComFalhaAnterior.registrarTentativaIndexacao({
      resultado: 'FALHA_TECNICA',
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      motivoFalha: 'primeira falha',
    });
    repositorio.definirExistente(indiceComFalhaAnterior);
    embeddingGateway.configurarFalha(new Error('segunda falha'));

    await useCase.executar(TENANT_ID, 'OrcamentoValidado', { qualquer: 'coisa' });

    const evento = eventPublisher.eventos[0]! as FalhaIndexacaoDetectada;
    expect(evento.tentativaNumero).toBe(2);
  });

  it('falha de infraestrutura no upsert do caminho de sucesso propaga (não é reclassificada como FALHA_TECNICA)', async () => {
    const { embeddingGateway, repositorio, eventPublisher, useCase } = montarCaso();
    embeddingGateway.configurarSucesso(embeddingFixture());
    const erroInfra = new Error('conexão com Postgres recusada');
    repositorio.falharNaProximaChamada(erroInfra);

    await expect(
      useCase.executar(TENANT_ID, 'OrcamentoValidado', { qualquer: 'coisa' }),
    ).rejects.toThrow(erroInfra);

    expect(eventPublisher.eventos).toHaveLength(0);
  });

  it('traduz o payload upstream via ACL, nunca acessando o payload bruto diretamente', async () => {
    const { acl, embeddingGateway, useCase } = montarCaso();
    embeddingGateway.configurarSucesso(embeddingFixture());
    const payloadBruto = { itens: [], condicoesComerciais: {} };

    await useCase.executar(TENANT_ID, 'OrcamentoValidadoComRessalva', payloadBruto);

    expect(acl.chamadas).toEqual([{ detailType: 'OrcamentoValidadoComRessalva', payloadBruto }]);
  });
});
