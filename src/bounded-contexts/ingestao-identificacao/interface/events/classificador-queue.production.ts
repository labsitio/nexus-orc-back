/**
 * Composição de produção do handler Lambda consumidor de `classificador-queue`
 * (issue #613 — T034/#39 fornece a fábrica, este arquivo só compõe). Mesmo
 * formato de `indexador-queue.production.ts` (#623, ADR-009).
 *
 * Fino de propósito: nenhuma regra de negócio aqui, só composição.
 * `export const handler` é a assinatura exata que o runtime Node da AWS
 * Lambda espera, sem adapter Fastify/container (ADR-009, Decisão 1).
 */
import {
  clientesProducao,
  exigirAgenteIaBedrockEmProducao,
} from '../../../../composition/aws-clients.production.js';
import {
  criarAgenteClassificador,
  criarIngestaoIdentificacao,
} from '../../../../composition/ingestao-identificacao.js';
import { MarkItDownConversaoACL } from '../../infrastructure/markitdown-conversao.acl.js';
import { criarClassificadorQueueHandler } from './classificador-queue.handler.js';

exigirAgenteIaBedrockEmProducao();

function variavelObrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`${nome} não configurada — obrigatória para o handler classificador-queue.`);
  }
  return valor;
}

const { db, s3, eventBridge, bedrock, lambda } = clientesProducao();

const { classificarOrcamento } = criarIngestaoIdentificacao({
  db,
  s3,
  eventBridge,
  bucket: variavelObrigatoria('NEXO_BUCKET_RAW'),
  eventBusName: variavelObrigatoria('NEXO_EVENT_BUS'),
  // `exigirAgenteIaBedrockEmProducao()` já garantiu NEXO_AGENTE_IA=bedrock —
  // `criarAgenteClassificador` sempre resolve para `BedrockClassificadorGateway` aqui.
  classificador: criarAgenteClassificador({
    agenteIa: 'bedrock',
    bedrock,
    bedrockModeloClassificadorId: variavelObrigatoria('NEXO_BEDROCK_CLASSIFICADOR_MODEL_ID'),
  }),
  conversor: new MarkItDownConversaoACL(lambda, variavelObrigatoria('NEXO_MARKITDOWN_LAMBDA_ARN')),
});

export const handler = criarClassificadorQueueHandler(classificarOrcamento);
