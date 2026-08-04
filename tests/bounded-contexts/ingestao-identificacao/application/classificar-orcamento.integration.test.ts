import { describe, expect, it } from 'vitest';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { ResultadoClassificacao } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import type {
  AgenteClassificadorGateway,
  ResultadoAgenteClassificador,
} from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/agente-classificador.gateway.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.js';
import { OrcamentoClassificado } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-classificado.event.js';
import { OrcamentoEscalonadoParaRevisaoHumana } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-escalonado-revisao-humana.event.js';

/**
 * T029 — Integration test do consumidor da fila SQS `classificador-queue`.
 *
 * `ClassificarOrcamento` (Application, T032/issue #37) e o handler Lambda
 * consumidor (Interface, T034/issue #39) ainda não existem — são issues
 * downstream desta trilha, ainda não implementadas. Este teste fixa,
 * como especificação executável, a orquestração que esses componentes
 * deverão seguir (busca bruto → MarkItDown → Bedrock → aggregate →
 * publica evento), usando fakes para as duas únicas dependências
 * relevantes ao critério de aceite de T029: o gateway Bedrock (confiança
 * simulada) e o EventPublisher (evento publicado). Nenhum código de
 * produção de T030–T034 é antecipado aqui.
 */

class AgenteClassificadorGatewayFake implements AgenteClassificadorGateway {
  constructor(private readonly resultadoSimulado: ResultadoAgenteClassificador) {}

  async classificar(): Promise<ResultadoAgenteClassificador> {
    return this.resultadoSimulado;
  }
}

class EventPublisherFake implements EventPublisher {
  readonly eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

function novoOrcamentoRecebido(): Orcamento {
  return Orcamento.receber({
    id: OrcamentoId.novo(),
    canal: Canal.de('PORTAL_WEB'),
    referenciaBruta: ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'portal/arquivo.pdf',
      versionId: 'v1',
    }),
  });
}

/**
 * Orquestração equivalente à que `ClassificarOrcamento` (T032) executará ao
 * consumir uma mensagem de `classificador-queue`: classifica, registra a
 * tentativa no agregado e publica o evento correspondente ao status
 * resultante — nunca decide o evento fora da regra do agregado (T027).
 */
async function processarMensagemClassificadorQueue(
  orcamento: Orcamento,
  gateway: AgenteClassificadorGateway,
  publisher: EventPublisher,
): Promise<void> {
  const resultadoBruto = await gateway.classificar(
    'texto já convertido pelo MarkItDownConversaoACL',
  );
  const resultado = ResultadoClassificacao.criar({
    fornecedorIdentificado: resultadoBruto.fornecedorIdentificado,
    formatoIdentificado: resultadoBruto.formatoIdentificado,
    nivelConfianca: NivelConfianca.de(resultadoBruto.nivelConfianca),
    agenteOrigem: 'CLASSIFICADOR',
  });

  orcamento.registrarTentativaClassificador(resultado);

  const evento =
    orcamento.status === 'CLASSIFICADO'
      ? new OrcamentoClassificado(
          orcamento.id.toString(),
          resultado.paraPayload(),
          {
            bucket: orcamento.referenciaBruta.bucket,
            key: orcamento.referenciaBruta.key,
            versionId: orcamento.referenciaBruta.versionId,
          },
          '018f4b1a-tenant-0000-000000000000',
        )
      : new OrcamentoEscalonadoParaRevisaoHumana(
          orcamento.id.toString(),
          resultado.paraPayload(),
          '018f4b1a-tenant-0000-000000000000',
        );
  await publisher.publicar(evento);
}

describe('Consumidor de classificador-queue (integração simulada)', () => {
  it('publica OrcamentoClassificado quando o gateway Bedrock mockado simula confiança >= 80', async () => {
    const orcamento = novoOrcamentoRecebido();
    const gateway = new AgenteClassificadorGatewayFake({
      fornecedorIdentificado: 'Fornecedor X',
      formatoIdentificado: 'PDF',
      nivelConfianca: 92,
    });
    const publisher = new EventPublisherFake();

    await processarMensagemClassificadorQueue(orcamento, gateway, publisher);

    expect(publisher.eventosPublicados).toHaveLength(1);
    expect(publisher.eventosPublicados[0]?.detailType).toBe(OrcamentoClassificado.detailType);
    expect(publisher.eventosPublicados[0]?.orcamentoId).toBe(orcamento.id.toString());
    expect(orcamento.status).toBe('CLASSIFICADO');
  });

  it('publica OrcamentoEscalonadoParaRevisaoHumana quando o gateway Bedrock mockado simula confiança < 80', async () => {
    const orcamento = novoOrcamentoRecebido();
    const gateway = new AgenteClassificadorGatewayFake({
      fornecedorIdentificado: 'Fornecedor Y',
      formatoIdentificado: 'XLSX',
      nivelConfianca: 79,
    });
    const publisher = new EventPublisherFake();

    await processarMensagemClassificadorQueue(orcamento, gateway, publisher);

    expect(publisher.eventosPublicados).toHaveLength(1);
    expect(publisher.eventosPublicados[0]?.detailType).toBe(
      OrcamentoEscalonadoParaRevisaoHumana.detailType,
    );
    expect(orcamento.status).toBe('PENDENTE_REVISAO_HUMANA');
  });

  it('nunca publica evento se o gateway Bedrock mockado retorna confiança fora de 0–100 (falha rápido, sem evento espúrio)', async () => {
    const orcamento = novoOrcamentoRecebido();
    const gateway = new AgenteClassificadorGatewayFake({
      fornecedorIdentificado: 'Fornecedor Z',
      formatoIdentificado: 'PDF',
      nivelConfianca: 101,
    });
    const publisher = new EventPublisherFake();

    await expect(
      processarMensagemClassificadorQueue(orcamento, gateway, publisher),
    ).rejects.toThrow();
    expect(publisher.eventosPublicados).toHaveLength(0);
  });
});
