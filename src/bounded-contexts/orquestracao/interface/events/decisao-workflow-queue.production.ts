/**
 * Composição de produção do handler Lambda consumidor de
 * `decisao-workflow-queue` (issue #624 — T029/#235 fornece a fábrica, este
 * arquivo só compõe). Mesmo formato de `indexador-queue.production.ts`
 * (#623, ADR-009).
 *
 * Fino de propósito: nenhuma regra de negócio aqui, só composição.
 * `export const handler` é a assinatura exata que o runtime Node da AWS
 * Lambda espera, sem adapter Fastify/container (ADR-009, Decisão 1).
 *
 * Única das 3 Lambdas deste BC que invoca Bedrock (`AgenteOrquestradorGateway`)
 * e publica evento de desfecho — por isso é a única a exigir
 * `exigirAgenteIaBedrockEmProducao()`, `NEXO_EVENT_BUS` e o modelo do
 * Orquestrador.
 */
import { criarConsolidarEDecidirWorkflow } from '../../../../composition/orquestracao.js';
import {
  clientesProducao,
  exigirAgenteIaBedrockEmProducao,
} from '../../../../composition/aws-clients.production.js';
import { criarDecisaoWorkflowQueueHandler } from './decisao-workflow-queue.handler.js';

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

function nexoBedrockOrquestradorModelId(): string {
  const valor = process.env.NEXO_BEDROCK_ORQUESTRADOR_MODEL_ID;
  if (!valor) {
    throw new Error(
      'NEXO_BEDROCK_ORQUESTRADOR_MODEL_ID não configurada — obrigatória para invocar o Agente Orquestrador.',
    );
  }
  return valor;
}

const { db, eventBridge, bedrock } = clientesProducao();

const { consolidarEDecidirWorkflow, acl } = criarConsolidarEDecidirWorkflow({
  db,
  eventBridge,
  eventBusName: nexoEventBusName(),
  bedrock,
  modeloOrquestradorId: nexoBedrockOrquestradorModelId(),
});

export const handler = criarDecisaoWorkflowQueueHandler(consolidarEDecidirWorkflow, acl);
