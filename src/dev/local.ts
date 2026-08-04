/**
 * Execução local do fluxo 001 → 002 (spec 001 T067 / issue #589).
 *
 * Sobe o servidor HTTP com as 4 rotas de Ingestão e um poller que consome
 * `classificador-queue` e `extrator-queue` chamando **os mesmos handlers** que
 * as Lambdas usam em produção. Postgres, S3, EventBridge e SQS são reais
 * (docker-compose + LocalStack); apenas dois adaptadores são substituídos aqui,
 * e ambos por impossibilidade local declarada:
 *
 * - **Bedrock** — LocalStack community não implementa (Bedrock é Pro). Trocar
 *   `classificadorLocal`/`extratorLocal` por `BedrockClassificadorGateway`/
 *   `BedrockExtratorGateway` com credencial AWS real não exige mudar mais nada.
 * - **MarkItDown** — o Lambda Python que os ACLs de produção invocam ainda não
 *   existe (issues #588 e #590). Enquanto não existir, aqui só passa texto.
 *   Quando existir, o caminho correto é rodá-lo no LocalStack Lambda e usar os
 *   ACLs de produção — nunca promover os stubs abaixo a adaptador oficial.
 *
 * IMPORTANTE: LocalStack não aplica IAM. Nada exercitado aqui prova que as
 * roles de produção têm `events:PutEvents` (ADR-004, issues #576-#580).
 */
import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import Fastify from 'fastify';

import { criarExtracao } from '../composition/extracao.js';
import {
  criarIngestaoIdentificacao,
  registrarRotasIngestaoIdentificacao,
} from '../composition/ingestao-identificacao.js';
import type { AgenteClassificadorGateway } from '../bounded-contexts/ingestao-identificacao/domain/gateways/agente-classificador.gateway.js';
import type { MarkItDownConversaoACL } from '../bounded-contexts/ingestao-identificacao/domain/gateways/markitdown-conversao.acl.js';
import { sanitizarConteudoDocumento } from '../bounded-contexts/ingestao-identificacao/infrastructure/sanitizar-conteudo-documento.js';
import { criarClassificadorQueueHandler } from '../bounded-contexts/ingestao-identificacao/interface/events/classificador-queue.handler.js';
import type { AgenteExtratorGateway } from '../bounded-contexts/extracao/domain/gateways/agente-extrator.gateway.js';
import type { MarkItDownConversaoExtracaoACL } from '../bounded-contexts/extracao/domain/gateways/markitdown-conversao-extracao.acl.js';
import { CampoExtraido } from '../bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../bounded-contexts/extracao/domain/value-objects/condicoes-comerciais.vo.js';
import { DescricaoProduto } from '../bounded-contexts/extracao/domain/value-objects/descricao-produto.vo.js';
import { Dinheiro } from '../bounded-contexts/extracao/domain/value-objects/dinheiro.vo.js';
import { ItemOrcamento } from '../bounded-contexts/extracao/domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';
import { PeriodoValidade } from '../bounded-contexts/extracao/domain/value-objects/periodo-validade.vo.js';
import { Quantidade } from '../bounded-contexts/extracao/domain/value-objects/quantidade.vo.js';
import { sanitizarConteudoExtracao } from '../bounded-contexts/extracao/infrastructure/sanitizar-conteudo-extracao.js';
import { criarExtratorQueueHandler } from '../bounded-contexts/extracao/interface/events/extrator-queue.handler.js';
import { db } from '../shared-kernel/database/client.js';
import { clientesLocais, configLocal } from './config.js';

const cfg = configLocal();
const { s3, eventBridge, sqs } = clientesLocais();

/**
 * Extensões cuja conversão "leve" é honesta sem MarkItDown. PDF/XLSX falham de
 * propósito: decodificar bytes binários como UTF-8 produziria lixo que o
 * classificador aceitaria em silêncio — exatamente o falso positivo que este
 * ambiente não deve produzir.
 */
const EXTENSOES_SUPORTADAS_SEM_MARKITDOWN = ['.txt', '.md', '.csv'];

const ERRO_SEM_MARKITDOWN =
  'Conversão de documento binário exige o Lambda MarkItDown, que ainda não existe (issues #588/#590). ' +
  `Localmente só ${EXTENSOES_SUPORTADAS_SEM_MARKITDOWN.join(', ')} atravessam o fluxo.`;

const conversorLocal: MarkItDownConversaoACL = {
  async converterParaTexto(conteudoBruto: Uint8Array, nomeArquivo: string): Promise<string> {
    const nome = nomeArquivo.toLowerCase();
    if (!EXTENSOES_SUPORTADAS_SEM_MARKITDOWN.some((ext) => nome.endsWith(ext))) {
      throw new Error(`${ERRO_SEM_MARKITDOWN} Arquivo recebido: "${nomeArquivo}".`);
    }
    // Mantém a sanitização do caminho de produção — o texto do fornecedor
    // continua sendo entrada não confiável mesmo com conversor local.
    return sanitizarConteudoDocumento(Buffer.from(conteudoBruto).toString('utf8'));
  },
};

const conversorExtracaoLocal: MarkItDownConversaoExtracaoACL = {
  async converter(bruto: Buffer): Promise<string> {
    return sanitizarConteudoExtracao(bruto.toString('utf8'));
  },
};

/**
 * Classificador determinístico: fornecedor = primeira linha não vazia,
 * confiança = `NEXO_LOCAL_CONFIANCA`. Permite exercitar os dois ramos do
 * agregado (>=80 CLASSIFICADO, <80 PENDENTE_REVISAO_HUMANA) sem Bedrock.
 */
const classificadorLocal: AgenteClassificadorGateway = {
  async classificar(textoDocumento: string) {
    const primeiraLinha =
      textoDocumento
        .split('\n')
        .map((linha) => linha.trim())
        .find((linha) => linha.length > 0) ?? 'Fornecedor não identificado';
    return {
      fornecedorIdentificado: primeiraLinha.slice(0, 120),
      formatoIdentificado: 'texto-plano',
      nivelConfianca: cfg.confiancaClassificador,
    };
  },
};

/**
 * Extrator determinístico com um item e condições comerciais completas. Com
 * `NEXO_LOCAL_EXTRACAO_CAMPO_FALTANDO=true`, deixa `condicoesPagamento` sem
 * extrair — é assim que se exercita `ExtracaoEscalonadaParaRevisaoHumana`.
 */
const extratorLocal: AgenteExtratorGateway = {
  async extrair() {
    const confianca = NivelConfianca.de(cfg.confiancaClassificador);
    const item = ItemOrcamento.de({
      descricao: CampoExtraido.extraido(
        DescricaoProduto.de('Item de exemplo (extrator local)'),
        confianca,
        'EXTRATOR',
      ),
      quantidade: CampoExtraido.extraido(Quantidade.de(2), confianca, 'EXTRATOR'),
      precoUnitario: CampoExtraido.extraido(Dinheiro.de(12345, 'BRL'), confianca, 'EXTRATOR'),
    });
    const validoAte = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return {
      itens: [item],
      condicoesComerciais: CondicoesComerciais.de({
        condicoesPagamento: cfg.extracaoCampoFaltando
          ? CampoExtraido.naoExtraido<string>(confianca, 'EXTRATOR')
          : CampoExtraido.extraido<string>('30 dias', confianca, 'EXTRATOR'),
        prazoValidade: CampoExtraido.extraido(PeriodoValidade.de(validoAte), confianca, 'EXTRATOR'),
        condicoesEntrega: CampoExtraido.extraido<string>('CIF', confianca, 'EXTRATOR'),
      }),
    };
  },
};

const ingestao = criarIngestaoIdentificacao({
  db,
  s3,
  eventBridge,
  bucket: cfg.bucket,
  eventBusName: cfg.eventBusName,
  classificador: classificadorLocal,
  conversor: conversorLocal,
});

const extracao = criarExtracao({
  db,
  s3,
  eventBridge,
  eventBusName: cfg.eventBusName,
  extrator: extratorLocal,
  conversor: conversorExtracaoLocal,
});

/** Sem `preHandler`: nenhuma autenticação Cognito localmente. Nunca em produção. */
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
registrarRotasIngestaoIdentificacao(app, ingestao);

const handlers = {
  'classificador-queue': criarClassificadorQueueHandler(ingestao.classificarOrcamento),
  'extrator-queue': criarExtratorQueueHandler(extracao.extrairDadosOrcamento),
} as const;

let rodando = true;

/**
 * Substituto local do event source mapping do Lambda: long-poll na fila,
 * invoca o handler de produção e apaga só as mensagens que ele NÃO reportou
 * como `batchItemFailures` — as falhas voltam para a fila e, depois de
 * `maxReceiveCount`, para a DLQ, igual em produção.
 */
async function consumir(nomeFila: keyof typeof handlers): Promise<void> {
  const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: nomeFila }));
  if (!QueueUrl) {
    throw new Error(`Fila "${nomeFila}" não encontrada — rode o seed antes (pnpm dev:seed).`);
  }
  const handler = handlers[nomeFila];

  while (rodando) {
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
      }),
    );
    if (!Messages?.length) {
      continue;
    }

    const records = Messages.filter(
      (m): m is typeof m & { MessageId: string; Body: string; ReceiptHandle: string } =>
        m.MessageId !== undefined && m.Body !== undefined && m.ReceiptHandle !== undefined,
    ).map((m) => ({ messageId: m.MessageId, body: m.Body, receiptHandle: m.ReceiptHandle }));

    const { batchItemFailures } = await handler({
      Records: records.map(({ messageId, body }) => ({ messageId, body })),
    });
    const falhas = new Set(batchItemFailures.map((f) => f.itemIdentifier));

    for (const record of records) {
      if (falhas.has(record.messageId)) {
        app.log.warn({ fila: nomeFila, messageId: record.messageId }, 'batch item failure');
        continue;
      }
      await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: record.receiptHandle }));
    }
  }
}

async function main(): Promise<void> {
  await app.listen({ port: cfg.porta, host: '0.0.0.0' });
  app.log.info(
    {
      bucket: cfg.bucket,
      bus: cfg.eventBusName,
      confiancaClassificador: cfg.confiancaClassificador,
      extracaoCampoFaltando: cfg.extracaoCampoFaltando,
    },
    'ambiente local pronto — Bedrock e MarkItDown substituídos por stubs determinísticos',
  );

  const pollers = (Object.keys(handlers) as (keyof typeof handlers)[]).map((fila) =>
    consumir(fila).catch((erro: unknown) => {
      app.log.error({ err: erro, fila }, 'poller encerrado por erro');
      rodando = false;
    }),
  );

  for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sinal, () => {
      rodando = false;
      void app.close().then(() => process.exit(0));
    });
  }

  await Promise.all(pollers);
}

await main();
