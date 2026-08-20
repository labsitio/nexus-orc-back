/**
 * Composição de produção do handler Lambda consumidor de `extrator-queue`
 * (issue #614 — T023/#88 fornece a fábrica, este arquivo só compõe). Mesmo
 * formato de `classificador-queue.production.ts` (spec 001, #613, ADR-009).
 *
 * Fino de propósito: nenhuma regra de negócio aqui, só composição.
 * `export const handler` é a assinatura exata que o runtime Node da AWS
 * Lambda espera, sem adapter Fastify/container (ADR-009, Decisão 1).
 */
import {
  clientesProducao,
  exigirAgenteIaBedrockEmProducao,
} from '../../../../composition/aws-clients.production.js';
import { criarExtracao, selecionarAgenteExtrator } from '../../../../composition/extracao.js';
import { MarkItDownConversaoExtracaoACL } from '../../infrastructure/markitdown-conversao-extracao.acl.js';
import { criarExtratorQueueHandler } from './extrator-queue.handler.js';

exigirAgenteIaBedrockEmProducao();

function variavelObrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`${nome} não configurada — obrigatória para o handler extrator-queue.`);
  }
  return valor;
}

const { db, s3, eventBridge, bedrock, lambda } = clientesProducao();

const { extrairDadosOrcamento } = criarExtracao({
  db,
  s3,
  eventBridge,
  eventBusName: variavelObrigatoria('NEXO_EVENT_BUS'),
  // `exigirAgenteIaBedrockEmProducao()` já garantiu NEXO_AGENTE_IA=bedrock —
  // `selecionarAgenteExtrator` sempre resolve para `BedrockExtratorGateway` aqui.
  extrator: selecionarAgenteExtrator({
    bedrock: { client: bedrock, modelId: variavelObrigatoria('NEXO_BEDROCK_EXTRATOR_MODEL_ID') },
  }),
  conversor: new MarkItDownConversaoExtracaoACL(
    lambda,
    variavelObrigatoria('NEXO_MARKITDOWN_EXTRACAO_LAMBDA_ARN'),
  ),
});

export const handler = criarExtratorQueueHandler(extrairDadosOrcamento);
