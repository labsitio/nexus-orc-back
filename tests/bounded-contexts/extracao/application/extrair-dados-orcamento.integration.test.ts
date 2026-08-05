import { describe, expect, it } from 'vitest';
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
import { OrcamentoExtraido } from '../../../../src/bounded-contexts/extracao/domain/events/orcamento-extraido.event.js';
import { ExtracaoEscalonadaParaRevisaoHumana } from '../../../../src/bounded-contexts/extracao/domain/events/extracao-escalonada-revisao-humana.event.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * T020 — Integration test: `OrcamentoClassificado` publicado → `OrcamentoExtraido`
 * publicado (ou `ExtracaoEscalonadaParaRevisaoHumana`), payload com itens/condições
 * estruturados; p95 medido em ambiente de teste local.
 *
 * `ExtrairDadosOrcamento` (Application, T022/#87) e o handler Lambda consumidor de
 * `extrator-queue` (Interface, T023) ainda não existem — são issues downstream desta
 * trilha, não implementadas nesta task. Este teste fixa, como especificação
 * executável, a orquestração que `ExtrairDadosOrcamento` deverá seguir (lê bruto S3
 * → converte via MarkItDown ACL → invoca Agente Extrator → aplica
 * `registrarTentativaExtrator` → publica evento), mesmo padrão já aprovado em
 * `tests/bounded-contexts/ingestao-identificacao/application/classificar-orcamento.integration.test.ts`
 * (T029/spec 001). Nenhum código de produção de T021/T022 é antecipado aqui.
 *
 * O plan.md classifica testes de integração contra LocalStack real (SQS/EventBridge/S3)
 * como execução de CI/DevOps, não deste teste — aqui a fila e o bus são substituídos
 * pelos fakes de `AgenteExtratorGateway`/`LeituraBrutaGateway`/`EventPublisher`, e o p95
 * medido é o da orquestração em si (proxy local), não o do pipeline AWS ponta a ponta
 * (esse é T042, Polish, após IAM/Lambda reais existirem).
 */

const AGENTE_EXTRATOR_ORIGEM = 'EXTRATOR' as const;

class LeituraBrutaGatewayFake implements LeituraBrutaGateway {
  async ler(): Promise<Buffer> {
    return Buffer.from('conteúdo bruto simulado do orçamento');
  }
}

class MarkItDownConversaoExtracaoACLFake implements MarkItDownConversaoExtracaoACL {
  async converter(bruto: Buffer): Promise<string> {
    return bruto.toString('utf-8');
  }
}

class AgenteExtratorGatewayFake implements AgenteExtratorGateway {
  constructor(private readonly resultadoSimulado: AgenteExtratorResultado) {}

  async extrair(_input: AgenteExtratorInput): Promise<AgenteExtratorResultado> {
    return this.resultadoSimulado;
  }
}

class EventPublisherFake implements EventPublisher {
  readonly eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

function novaExtracaoPendente(): ExtracaoOrcamento {
  return ExtracaoOrcamento.criar(
    OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057'),
    ReferenciaClassificacao.de({
      fornecedorIdentificado: 'Distribuidora ABC Ltda',
      formatoIdentificado: 'PDF_TABELA_PADRAO',
      agenteOrigem: 'CLASSIFICADOR',
    }),
    ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'portal/arquivo.pdf',
      versionId: 'v1',
    }),
    TenantId.novo(),
  );
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

/**
 * Orquestração equivalente à que `ExtrairDadosOrcamento` (T022) executará ao
 * consumir uma mensagem de `extrator-queue`: lê o bruto, converte, invoca o
 * Extrator, registra a tentativa no agregado (T009) e publica o evento
 * correspondente ao status resultante — nunca decide o evento fora da regra
 * do agregado.
 */
async function processarMensagemExtratorQueue(
  extracao: ExtracaoOrcamento,
  leituraBruta: LeituraBrutaGateway,
  conversao: MarkItDownConversaoExtracaoACL,
  agenteExtrator: AgenteExtratorGateway,
  publisher: EventPublisher,
): Promise<void> {
  const bruto = await leituraBruta.ler(extracao.referenciaBrutaS3);
  const textoConvertido = await conversao.converter(bruto);
  const resultado = await agenteExtrator.extrair({
    textoConvertido,
    referenciaClassificacao: extracao.referenciaClassificacao,
  });

  extracao.registrarTentativaExtrator(resultado.itens, resultado.condicoesComerciais);

  const evento =
    extracao.status === 'EXTRAIDO'
      ? new OrcamentoExtraido(
          extracao.orcamentoId.toString(),
          extracao.itens.map((item) => item.paraPayload()),
          extracao.condicoesComerciais!.paraPayload(),
          '018f4b1a-tenant-0000-000000000000',
        )
      : new ExtracaoEscalonadaParaRevisaoHumana(
          extracao.orcamentoId.toString(),
          '1+ campo obrigatório sem confiança suficiente',
          '018f4b1a-tenant-0000-000000000000',
        );
  await publisher.publicar(evento);
}

describe('Consumidor de extrator-queue (integração simulada)', () => {
  it('publica OrcamentoExtraido com itens/condições estruturados quando todo campo obrigatório tem confiança suficiente', async () => {
    const extracao = novaExtracaoPendente();
    const agenteExtrator = new AgenteExtratorGatewayFake({
      itens: [itemCompleto()],
      condicoesComerciais: condicoesCompletas(),
    });
    const publisher = new EventPublisherFake();

    await processarMensagemExtratorQueue(
      extracao,
      new LeituraBrutaGatewayFake(),
      new MarkItDownConversaoExtracaoACLFake(),
      agenteExtrator,
      publisher,
    );

    expect(extracao.status).toBe('EXTRAIDO');
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as OrcamentoExtraido;
    expect(evento.detailType).toBe(OrcamentoExtraido.detailType);
    expect(evento.schemaVersion).toBe(2);
    expect(evento.orcamentoId).toBe(extracao.orcamentoId.toString());
    expect(evento.itens).toHaveLength(1);
    expect(evento.itens[0]?.descricao.valor).toEqual({
      descricao: 'Caixa de papelão ondulado 40x30x20',
      sku: undefined,
    });
    expect(evento.condicoesComerciais.condicoesPagamento.valor).toBe('30/60/90 dias');
  });

  it('publica ExtracaoEscalonadaParaRevisaoHumana (sem valor inventado) quando 1+ campo obrigatório sem confiança', async () => {
    const extracao = novaExtracaoPendente();
    const agenteExtrator = new AgenteExtratorGatewayFake({
      itens: [itemIncompleto()],
      condicoesComerciais: condicoesCompletas(),
    });
    const publisher = new EventPublisherFake();

    await processarMensagemExtratorQueue(
      extracao,
      new LeituraBrutaGatewayFake(),
      new MarkItDownConversaoExtracaoACLFake(),
      agenteExtrator,
      publisher,
    );

    expect(extracao.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as ExtracaoEscalonadaParaRevisaoHumana;
    expect(evento.detailType).toBe(ExtracaoEscalonadaParaRevisaoHumana.detailType);
    expect(extracao.itens[0]?.precoUnitario.valor).toBeNull();
    expect(extracao.itens[0]?.precoUnitario.extraido).toBe(false);
  });

  it('p95 da orquestração (20 execuções simuladas, ambiente de teste local) fica muito abaixo da meta de 5 minutos (spec.md)', async () => {
    const META_P95_MS = 5 * 60 * 1000;
    const duracoes: number[] = [];

    for (let i = 0; i < 20; i++) {
      const extracao = novaExtracaoPendente();
      const agenteExtrator = new AgenteExtratorGatewayFake({
        itens: [itemCompleto()],
        condicoesComerciais: condicoesCompletas(),
      });
      const publisher = new EventPublisherFake();

      const inicio = performance.now();
      await processarMensagemExtratorQueue(
        extracao,
        new LeituraBrutaGatewayFake(),
        new MarkItDownConversaoExtracaoACLFake(),
        agenteExtrator,
        publisher,
      );
      duracoes.push(performance.now() - inicio);
    }

    duracoes.sort((a, b) => a - b);
    const indiceP95 = Math.ceil(0.95 * duracoes.length) - 1;
    const p95 = duracoes[indiceP95]!;

    // ponytail: p95 aqui é da orquestração em memória (gateways fake), proxy
    // local exigido por T020 — medição real ponta a ponta (rede AWS, Bedrock,
    // cold start de Lambda) é T042 (Polish), após BedrockExtratorGateway (T021)
    // e o handler Lambda (T023) existirem.
    expect(p95).toBeLessThan(META_P95_MS);
  });
});
