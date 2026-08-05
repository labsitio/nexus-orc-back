/**
 * Composição de produção do handler Lambda consumidor de
 * `contexto-classificacao-queue` (issue #624 — T029/#235 fornece a fábrica,
 * este arquivo só compõe). Mesmo formato de `indexador-queue.production.ts`
 * (#623, ADR-009).
 *
 * Fino de propósito: nenhuma regra de negócio aqui, só composição.
 * `export const handler` é a assinatura exata que o runtime Node da AWS
 * Lambda espera, sem adapter Fastify/container (ADR-009, Decisão 1).
 *
 * `RegistrarContextoClassificacao` nunca decide nem publica evento — só
 * `db` é necessário aqui, nunca `eventBridge`/`bedrock` (a role IAM desta
 * Lambda espelha exatamente essa ausência).
 */
import { criarRegistrarContextoClassificacao } from '../../../../composition/orquestracao.js';
import { clientesProducao } from '../../../../composition/aws-clients.production.js';
import { criarContextoClassificacaoQueueHandler } from './contexto-classificacao-queue.handler.js';

const { db } = clientesProducao();

const { registrarContextoClassificacao, acl } = criarRegistrarContextoClassificacao({ db });

export const handler = criarContextoClassificacaoQueueHandler(registrarContextoClassificacao, acl);
