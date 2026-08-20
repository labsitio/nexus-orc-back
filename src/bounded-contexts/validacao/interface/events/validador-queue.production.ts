/**
 * Composição de produção do handler Lambda consumidor de `validador-queue`
 * (issue #615 — T025/#135 fornece a fábrica, este arquivo só compõe). Mesmo
 * formato de `extrator-queue.production.ts` (spec 002, #614, ADR-009).
 *
 * Fino de propósito: nenhuma regra de negócio aqui, só composição.
 * `export const handler` é a assinatura exata que o runtime Node da AWS
 * Lambda espera, sem adapter Fastify/container (ADR-009, Decisão 1).
 */
import {
  clientesProducao,
  exigirAgenteIaBedrockEmProducao,
} from '../../../../composition/aws-clients.production.js';
import { criarValidacao } from '../../../../composition/validacao.js';
import { criarValidadorQueueHandler } from './validador-queue.handler.js';

exigirAgenteIaBedrockEmProducao();

function variavelObrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`${nome} não configurada — obrigatória para o handler validador-queue.`);
  }
  return valor;
}

const { db, eventBridge, bedrock } = clientesProducao();

const { validarOrcamento } = criarValidacao({
  db,
  eventBridge,
  eventBusName: variavelObrigatoria('NEXO_EVENT_BUS'),
  bedrock,
  modeloCategorizacaoId: variavelObrigatoria('NEXO_BEDROCK_CATEGORIZACAO_MODEL_ID'),
  fornecedorCadastradoBaseUrl: variavelObrigatoria('NEXO_FORNECEDOR_CADASTRADO_BASE_URL'),
});

export const handler = criarValidadorQueueHandler(validarOrcamento);
