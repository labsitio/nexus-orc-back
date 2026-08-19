/**
 * Composição de produção do handler Lambda trigger S3 (`sftp-incoming/`)
 * consumido por `ReceberOrcamento` no canal SFTP (issue #613 — T023/#28
 * fornece a fábrica, este arquivo só compõe). Mesmo formato de
 * `indexador-queue.production.ts` (#623, ADR-009).
 *
 * Fino de propósito: nenhuma regra de negócio aqui, só composição.
 * `export const handler` é a assinatura exata que o runtime Node da AWS
 * Lambda espera, sem adapter Fastify/container (ADR-009, Decisão 1).
 *
 * `ReceberOrcamento` nunca invoca Bedrock nem MarkItDown (ambos entram só na
 * classificação) — por isso usa `criarReceberOrcamento` (deps enxutos),
 * não `criarIngestaoIdentificacao` (exigiria classificador/conversor à toa).
 */
import { clientesProducao } from '../../../../composition/aws-clients.production.js';
import { criarReceberOrcamento } from '../../../../composition/ingestao-identificacao.js';
import { DrizzleSftpTenantMappingRepository } from '../../infrastructure/persistence/drizzle-sftp-tenant-mapping.repository.js';
import { S3SftpTenantResolverGateway } from '../../infrastructure/s3-sftp-tenant-resolver.gateway.js';
import { criarHandlerSftpUpload } from './sftp-upload.handler.js';

function variavelObrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`${nome} não configurada — obrigatória para o handler sftp-upload.`);
  }
  return valor;
}

const { db, s3, eventBridge } = clientesProducao();

const receberOrcamento = criarReceberOrcamento({
  db,
  eventBridge,
  eventBusName: variavelObrigatoria('NEXO_EVENT_BUS'),
});

const resolverTenant = new S3SftpTenantResolverGateway(
  s3,
  new DrizzleSftpTenantMappingRepository(db),
);

export const handler = criarHandlerSftpUpload(receberOrcamento, resolverTenant);
