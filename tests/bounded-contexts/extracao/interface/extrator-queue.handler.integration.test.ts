import { describe, expect, it } from 'vitest';
import { criarExtratorQueueHandler } from '../../../../src/bounded-contexts/extracao/interface/events/extrator-queue.handler.js';
import { ExtrairDadosOrcamento } from '../../../../src/bounded-contexts/extracao/application/use-cases/extrair-dados-orcamento.js';
import { ExtracaoOrcamento } from '../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
import { CampoExtraido } from '../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../../../../src/bounded-contexts/extracao/domain/value-objects/condicoes-comerciais.vo.js';
import { DescricaoProduto } from '../../../../src/bounded-contexts/extracao/domain/value-objects/descricao-produto.vo.js';
import { ItemOrcamento } from '../../../../src/bounded-contexts/extracao/domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/extracao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/extracao/domain/value-objects/periodo-validade.vo.js';
import { Quantidade } from '../../../../src/bounded-contexts/extracao/domain/value-objects/quantidade.vo.js';
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
import { ExtracaoEscalonadaParaRevisaoHumana } from '../../../../src/bounded-contexts/extracao/domain/events/extracao-escalonada-revisao-humana.event.js';

/**
 * T029 — Integration test: campo ambíguo conhecido → `ExtracaoEscalonadaParaRevisaoHumana`
 * publicado diretamente pelo Extrator (sem agente revisor de IA, ADR-003) → status
 * reflete `PENDENTE_REVISAO_HUMANA`.
 *
 * Diferente de T020 (`extrair-dados-orcamento.integration.test.ts`, orquestração
 * reimplementada inline) e do unit test de `ExtrairDadosOrcamento`
 * (`extrair-dados-orcamento.test.ts`, sem passar pela fila), este teste percorre a
 * pilha real ponta a ponta: mensagem SQS (envelope EventBridge) → handler real
 * (`criarExtratorQueueHandler`, T023) → caso de uso real (`ExtrairDadosOrcamento`,
 * T022) → agregado real (`registrarTentativaExtrator`, T009) → repositório
 * (fake, papel de Infrastructure) → evento publicado (fake, papel de
 * Infrastructure/EventBridge). Único ponto substituído por fake é a borda com
 * serviços externos (S3, MarkItDown, Bedrock, SQS, EventBridge) — mesmo padrão
 * "integração simulada" já aprovado em T020.
 *
 * Não cobre a consulta de status via HTTP (`GET /v1/orcamentos/{id}/extracao/status`,
 * T024) — endpoint ainda não implementado nesta trilha e fora do escopo desta task;
 * "status reflete a pendência" é verificado no estado persistido do agregado
 * (`ExtracaoOrcamentoRepository.salvar`), fonte de dados de onde o futuro endpoint lerá.
 */

const AGENTE_EXTRATOR_ORIGEM = 'EXTRATOR' as const;
const ORCAMENTO_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

class RepositorioFake implements ExtracaoOrcamentoRepository {
  readonly salvos: ExtracaoOrcamento[] = [];

  async buscarPorOrcamentoId(): Promise<ExtracaoOrcamento | undefined> {
    return undefined;
  }

  async salvar(extracao: ExtracaoOrcamento): Promise<void> {
    this.salvos.push(extracao);
  }
}

class LeituraBrutaGatewayFake implements LeituraBrutaGateway {
  async ler(): Promise<Buffer> {
    return Buffer.from('conteúdo bruto simulado com campo ilegível');
  }
}

class MarkItDownConversaoExtracaoACLFake implements MarkItDownConversaoExtracaoACL {
  async converter(bruto: Buffer): Promise<string> {
    return bruto.toString('utf-8');
  }
}

/** Simula o Extrator (Bedrock) devolvendo baixa confiança para um campo obrigatório ambíguo/ilegível conhecido — nunca inventa o valor. */
class AgenteExtratorGatewayFake implements AgenteExtratorGateway {
  async extrair(_input: AgenteExtratorInput): Promise<AgenteExtratorResultado> {
    const confiancaAlta = NivelConfianca.de(92);
    const confiancaBaixa = NivelConfianca.de(15);
    return {
      itens: [
        ItemOrcamento.de({
          descricao: CampoExtraido.extraido(
            DescricaoProduto.de('Papel sulfite A4 75g/m² - resma 500 folhas'),
            confiancaAlta,
            AGENTE_EXTRATOR_ORIGEM,
          ),
          quantidade: CampoExtraido.extraido(
            Quantidade.de(200),
            confiancaAlta,
            AGENTE_EXTRATOR_ORIGEM,
          ),
          // Campo ambíguo/ilegível conhecido: confiança insuficiente → nunca inventado.
          precoUnitario: CampoExtraido.naoExtraido(confiancaBaixa, AGENTE_EXTRATOR_ORIGEM),
        }),
      ],
      condicoesComerciais: CondicoesComerciais.de({
        condicoesPagamento: CampoExtraido.extraido(
          '30 dias',
          confiancaAlta,
          AGENTE_EXTRATOR_ORIGEM,
        ),
        prazoValidade: CampoExtraido.extraido(
          PeriodoValidade.de(new Date('2026-09-30')),
          confiancaAlta,
          AGENTE_EXTRATOR_ORIGEM,
        ),
        condicoesEntrega: CampoExtraido.extraido(
          'FOB, 5 dias úteis',
          confiancaAlta,
          AGENTE_EXTRATOR_ORIGEM,
        ),
      }),
    };
  }
}

class EventPublisherFake implements EventPublisher {
  readonly eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

function mensagemSqsComCampoAmbiguo(): { messageId: string; body: string } {
  return {
    messageId: 'msg-campo-ambiguo-1',
    body: JSON.stringify({
      detail: {
        orcamentoId: ORCAMENTO_ID,
        resultado: {
          fornecedorIdentificado: 'Papelaria Central Ltda',
          formatoIdentificado: 'PDF_DIGITALIZADO',
          agenteOrigem: 'CLASSIFICADOR',
        },
        referenciaBruta: {
          bucket: 'nexo-orcamentos-raw',
          key: `sftp/${ORCAMENTO_ID}.pdf`,
          versionId: 'v1',
        },
      },
    }),
  };
}

describe('extrator-queue: campo ambíguo conhecido (integração simulada, T029)', () => {
  it('publica ExtracaoEscalonadaParaRevisaoHumana diretamente (sem revisor de IA) e persiste status PENDENTE_REVISAO_HUMANA, sem inventar o campo ambíguo', async () => {
    const repositorio = new RepositorioFake();
    const publisher = new EventPublisherFake();
    const useCase = new ExtrairDadosOrcamento(
      repositorio,
      new LeituraBrutaGatewayFake(),
      new MarkItDownConversaoExtracaoACLFake(),
      new AgenteExtratorGatewayFake(),
      publisher,
    );
    const handler = criarExtratorQueueHandler(useCase);

    const resposta = await handler({ Records: [mensagemSqsComCampoAmbiguo()] });

    // (b) ExtracaoEscalonadaParaRevisaoHumana publicado diretamente pelo Extrator —
    // nenhum passo de revisor de IA no meio do caminho (ADR-003: agente removido).
    expect(resposta.batchItemFailures).toHaveLength(0);
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as ExtracaoEscalonadaParaRevisaoHumana;
    expect(evento.detailType).toBe(ExtracaoEscalonadaParaRevisaoHumana.detailType);
    expect(evento.orcamentoId).toBe(ORCAMENTO_ID);
    expect(evento.motivo).toBe('1+ campo obrigatório sem confiança suficiente');

    // (c) status persistido reflete a pendência — fonte de dados de onde a
    // consulta de status (T024, fora de escopo aqui) lerá.
    expect(repositorio.salvos).toHaveLength(1);
    const extracaoPersistida = repositorio.salvos[0]!;
    expect(extracaoPersistida.orcamentoId.equals(OrcamentoId.de(ORCAMENTO_ID))).toBe(true);
    expect(extracaoPersistida.status).toBe('PENDENTE_REVISAO_HUMANA');

    // (a) nenhum valor inventado/estimado aparece para o campo ambíguo conhecido —
    // critério de aceite spec.md "Extrator NUNCA preenche o campo com um valor
    // inventado/estimado".
    const itemComCampoAmbiguo = extracaoPersistida.itens[0]!;
    expect(itemComCampoAmbiguo.precoUnitario.extraido).toBe(false);
    expect(itemComCampoAmbiguo.precoUnitario.valor).toBeNull();
    // Campos com confiança suficiente continuam presentes normalmente (só o
    // campo ambíguo fica pendente, não a extração inteira).
    expect(itemComCampoAmbiguo.descricao.valor).not.toBeNull();
  });
});
