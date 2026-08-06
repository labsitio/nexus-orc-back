/**
 * Composição de produção do handler Lambda consumidor de `indexador-queue`
 * (issue #623 — T030/#190 já fornece a fábrica, este arquivo só compõe).
 * Primeira Lambda de produção do repositório: formato de referência para as
 * irmãs #613 (001), #614 (002), #615 (003) e #624 (005) — ver ADR-009.
 *
 * Fino de propósito: nenhuma regra de negócio aqui, só composição.
 * `export const handler` é a assinatura exata que o runtime Node da AWS
 * Lambda espera, sem adapter Fastify/container (ADR-009, Decisão 1).
 */
import {
  criarBuscaIndexacao,
  selecionarAgenteEmbedding,
} from '../../../../composition/busca-indexacao.js';
import {
  clientesProducao,
  exigirAgenteIaBedrockEmProducao,
} from '../../../../composition/aws-clients.production.js';
import { criarIndexadorQueueHandler } from './indexador-queue.handler.js';

/** `amazon.titan-embed-text-v2:0` (plan.md/`bedrock-embedding.gateway.ts`) — sobrescrevível por ambiente. */
const MODELO_EMBEDDING_PADRAO = 'amazon.titan-embed-text-v2:0';

exigirAgenteIaBedrockEmProducao();

function nexoEventBusName(): string {
  const valor = process.env.NEXO_EVENT_BUS;
  if (!valor) {
    throw new Error(
      'NEXO_EVENT_BUS não configurada — obrigatória para publicar eventos de domínio.',
    );
  }
  return valor;
}

const { db, eventBridge, bedrock } = clientesProducao();

const buscaIndexacao = criarBuscaIndexacao({
  db,
  eventBridge,
  eventBusName: nexoEventBusName(),
  // `exigirAgenteIaBedrockEmProducao()` já garantiu NEXO_AGENTE_IA=bedrock —
  // `selecionarAgenteEmbedding` sempre resolve para `BedrockEmbeddingGateway` aqui.
  embeddingGateway: selecionarAgenteEmbedding({
    bedrock: {
      client: bedrock,
      modelId: process.env.NEXO_BEDROCK_EMBEDDING_MODEL_ID ?? MODELO_EMBEDDING_PADRAO,
    },
  }),
});

export const handler = criarIndexadorQueueHandler(
  buscaIndexacao.indexarOrcamento,
  buscaIndexacao.acl,
);
