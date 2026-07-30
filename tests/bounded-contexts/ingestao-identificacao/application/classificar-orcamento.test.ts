import { describe, expect, it } from 'vitest';
import {
  ClassificarOrcamento,
  OrcamentoNaoEncontradoParaClassificacaoError,
} from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/classificar-orcamento.js';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import type { ArmazenamentoBrutoGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/armazenamento-bruto.gateway.js';
import type { MarkItDownConversaoACL } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/markitdown-conversao.acl.js';
import type {
  AgenteClassificadorGateway,
  ResultadoAgenteClassificador,
} from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/agente-classificador.gateway.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.js';
import { OrcamentoClassificado } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-classificado.event.js';
import { OrcamentoEscalonadoParaRevisaoHumana } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-escalonado-revisao-humana.event.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { ResultadoClassificacao } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';

function novoOrcamentoRecebido(): Orcamento {
  return Orcamento.receber({
    id: OrcamentoId.novo(),
    canal: Canal.de('PORTAL_WEB'),
    referenciaBruta: ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'portal-web/orcamento.pdf',
      versionId: 'v1',
    }),
  });
}

class RepositorioFake implements OrcamentoRepository {
  constructor(private orcamento: Orcamento | undefined) {}
  salvos: Orcamento[] = [];

  async buscarPorId(): Promise<Orcamento | undefined> {
    return this.orcamento;
  }

  async salvar(orcamento: Orcamento): Promise<void> {
    this.salvos.push(orcamento);
  }
}

class ArmazenamentoBrutoFake implements ArmazenamentoBrutoGateway {
  async armazenar(): Promise<ReferenciaS3> {
    throw new Error('não usado neste teste');
  }
  async lerConteudoBruto(): Promise<Uint8Array> {
    return new Uint8Array([1, 2, 3]);
  }
}

class ConversorFake implements MarkItDownConversaoACL {
  async converterParaTexto(): Promise<string> {
    return 'texto convertido';
  }
}

class AgenteClassificadorFake implements AgenteClassificadorGateway {
  constructor(private readonly resultado: ResultadoAgenteClassificador) {}
  async classificar(): Promise<ResultadoAgenteClassificador> {
    return this.resultado;
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

describe('ClassificarOrcamento', () => {
  it('busca bruto, converte, classifica e publica OrcamentoClassificado quando confiança >= 80', async () => {
    const orcamento = novoOrcamentoRecebido();
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'Acme Ltda',
        formatoIdentificado: 'PDF',
        nivelConfianca: 90,
      }),
      publisher,
    );

    await useCase.executar(orcamento.id.toString());

    expect(orcamento.status).toBe('CLASSIFICADO');
    expect(repositorio.salvos).toHaveLength(1);
    expect(publisher.eventosPublicados).toHaveLength(1);
    expect(publisher.eventosPublicados[0]?.detailType).toBe(OrcamentoClassificado.detailType);
  });

  it('publica OrcamentoEscalonadoParaRevisaoHumana quando confiança < 80', async () => {
    const orcamento = novoOrcamentoRecebido();
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'Acme Ltda',
        formatoIdentificado: 'PDF',
        nivelConfianca: 40,
      }),
      publisher,
    );

    await useCase.executar(orcamento.id.toString());

    expect(orcamento.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(publisher.eventosPublicados[0]?.detailType).toBe(
      OrcamentoEscalonadoParaRevisaoHumana.detailType,
    );
  });

  it('lança erro e nunca publica evento se o orçamento não existir', async () => {
    const repositorio = new RepositorioFake(undefined);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'X',
        formatoIdentificado: 'PDF',
        nivelConfianca: 90,
      }),
      publisher,
    );

    await expect(useCase.executar(OrcamentoId.novo().toString())).rejects.toThrow(
      OrcamentoNaoEncontradoParaClassificacaoError,
    );
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('nunca publica evento se o orçamento já não estiver em RECEBIDO (transição inválida do agregado)', async () => {
    const orcamento = novoOrcamentoRecebido();
    orcamento.registrarTentativaClassificador(
      ResultadoClassificacao.criar({
        fornecedorIdentificado: 'X',
        formatoIdentificado: 'PDF',
        nivelConfianca: NivelConfianca.de(90),
        agenteOrigem: 'CLASSIFICADOR',
      }),
    );
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'X',
        formatoIdentificado: 'PDF',
        nivelConfianca: 90,
      }),
      publisher,
    );

    await expect(useCase.executar(orcamento.id.toString())).rejects.toThrow();
    expect(publisher.eventosPublicados).toHaveLength(0);
  });
});
