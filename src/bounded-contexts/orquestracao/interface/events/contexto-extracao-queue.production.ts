/**
 * Composição de produção do handler Lambda consumidor de
 * `contexto-extracao-queue` (issue #624 — T029/#235 fornece a fábrica, este
 * arquivo só compõe). Mesmo formato de `indexador-queue.production.ts`
 * (#623, ADR-009).
 *
 * Fino de propósito: nenhuma regra de negócio aqui, só composição.
 * `export const handler` é a assinatura exata que o runtime Node da AWS
 * Lambda espera, sem adapter Fastify/container (ADR-009, Decisão 1).
 *
 * `RegistrarContextoExtracao` nunca decide nem publica evento — só `db` é
 * necessário aqui, nunca `eventBridge`/`bedrock` (a role IAM desta Lambda
 * espelha exatamente essa ausência).
 */
import { criarRegistrarContextoExtracao } from '../../../../composition/orquestracao.js';
import { clientesProducao } from '../../../../composition/aws-clients.production.js';
import { criarContextoExtracaoQueueHandler } from './contexto-extracao-queue.handler.js';

const { db } = clientesProducao();

const { registrarContextoExtracao, acl } = criarRegistrarContextoExtracao({ db });

export const handler = criarContextoExtracaoQueueHandler(registrarContextoExtracao, acl);
