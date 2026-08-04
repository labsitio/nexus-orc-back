import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { S3Client } from '@aws-sdk/client-s3';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { FastifyInstance } from 'fastify';

import { ClassificarOrcamento } from '../bounded-contexts/ingestao-identificacao/application/use-cases/classificar-orcamento.js';
import { ConfirmarRevisaoHumana } from '../bounded-contexts/ingestao-identificacao/application/use-cases/confirmar-revisao-humana.js';
import { ConsultarStatusOrcamento } from '../bounded-contexts/ingestao-identificacao/application/use-cases/consultar-status-orcamento.js';
import { ReceberOrcamento } from '../bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.js';
import type { AgenteClassificadorGateway } from '../bounded-contexts/ingestao-identificacao/domain/gateways/agente-classificador.gateway.js';
import type { ArmazenamentoBrutoGateway } from '../bounded-contexts/ingestao-identificacao/domain/gateways/armazenamento-bruto.gateway.js';
import type { CacheIdentificacaoGateway } from '../bounded-contexts/ingestao-identificacao/domain/gateways/cache-identificacao.gateway.js';
import type { MarkItDownConversaoACL } from '../bounded-contexts/ingestao-identificacao/domain/gateways/markitdown-conversao.acl.js';
import { EventBridgePublisher } from '../bounded-contexts/ingestao-identificacao/infrastructure/eventbridge.publisher.js';
import { DrizzleIdempotencyKeyRepository } from '../bounded-contexts/ingestao-identificacao/infrastructure/persistence/drizzle-idempotency-key.repository.js';
import { DrizzleOrcamentoRepository } from '../bounded-contexts/ingestao-identificacao/infrastructure/persistence/drizzle-orcamento.repository.js';
import { S3ArmazenamentoBrutoGateway } from '../bounded-contexts/ingestao-identificacao/infrastructure/s3-armazenamento-bruto.gateway.js';
import { registrarRotaConfirmarUpload } from '../bounded-contexts/ingestao-identificacao/interface/http/confirmar-upload.controller.js';
import { registrarRotaRevisaoHumana } from '../bounded-contexts/ingestao-identificacao/interface/http/revisao-humana.controller.js';
import type { RotaOpts } from '../bounded-contexts/ingestao-identificacao/interface/http/route-opts.js';
import { registrarRotaStatusOrcamento } from '../bounded-contexts/ingestao-identificacao/interface/http/status.controller.js';
import { registrarRotaUploadUrl } from '../bounded-contexts/ingestao-identificacao/interface/http/upload-url.controller.js';
import { criarTenantContext } from '../shared-kernel/tenant/tenant-context.js';
import type { TenantId } from '../shared-kernel/tenant/tenant-id.vo.js';

/**
 * Composition root do BC Ingestão & Identificação — o único lugar que conhece
 * simultaneamente Application, Infrastructure e Interface deste contexto.
 *
 * Todo adaptador concreto entra por aqui: os casos de uso e controllers já
 * mergeados recebem tudo por construtor/parâmetro e permanecem ignorantes de
 * como o cliente AWS, o pool Postgres ou o gateway do agente foram criados.
 * Consequência prática: o mesmo módulo serve o handler Lambda de produção e a
 * execução local (`src/dev/local.ts`) — o que muda é só quem constrói `deps`.
 */
export interface IngestaoIdentificacaoDeps {
  readonly db: NodePgDatabase;
  readonly s3: S3Client;
  readonly eventBridge: EventBridgeClient;
  /** Bucket versionado de bruto — `nexo-orcamentos-raw` (T012/#17). */
  readonly bucket: string;
  /** Bus de domínio único — `nexo-dominio-bus` (T013/#18). */
  readonly eventBusName: string;
  readonly classificador: AgenteClassificadorGateway;
  readonly conversor: MarkItDownConversaoACL;
  /** Cache de identificação (spec 009 T012) — opcional, best-effort. */
  readonly cacheIdentificacao?: CacheIdentificacaoGateway;
}

export interface IngestaoIdentificacao {
  readonly armazenamento: ArmazenamentoBrutoGateway;
  readonly receberOrcamento: ReceberOrcamento;
  readonly classificarOrcamento: ClassificarOrcamento;
  readonly consultarStatusOrcamento: ConsultarStatusOrcamento;
  readonly confirmarRevisaoHumana: ConfirmarRevisaoHumana;
}

export function criarIngestaoIdentificacao(deps: IngestaoIdentificacaoDeps): IngestaoIdentificacao {
  // (spec 007, T018) `DrizzleOrcamentoRepository` estende
  // `DrizzleTenantScopedRepositoryBase` (T008): o `TenantContext` é fixado no
  // construtor e MUST NUNCA ser reaproveitado entre tenants. Por isso esta
  // composition root nunca constrói uma instância pronta — só uma fábrica
  // `(tenantId) => repo`, injetada nos 4 casos de uso abaixo (que permanecem
  // singletons de longa duração; só o repositório é per-call). Cobre
  // uniformemente HTTP (1 tenant por requisição) e o lote SQS/S3 de
  // `classificador-queue.handler.ts`/`sftp-upload.handler.ts` (N tenants por
  // invocação de warm start), sem exigir reconstruir os casos de uso a cada
  // chamada.
  const criarRepositorioOrcamento = (tenantId: TenantId) =>
    new DrizzleOrcamentoRepository(deps.db, criarTenantContext(tenantId));
  const idempotencia = new DrizzleIdempotencyKeyRepository(deps.db);
  const publisher = new EventBridgePublisher(deps.eventBridge, deps.eventBusName);
  const armazenamento = new S3ArmazenamentoBrutoGateway(deps.s3, deps.bucket);

  return {
    armazenamento,
    receberOrcamento: new ReceberOrcamento(criarRepositorioOrcamento, publisher, idempotencia),
    classificarOrcamento: new ClassificarOrcamento(
      criarRepositorioOrcamento,
      armazenamento,
      deps.conversor,
      deps.classificador,
      publisher,
      deps.cacheIdentificacao,
    ),
    consultarStatusOrcamento: new ConsultarStatusOrcamento(criarRepositorioOrcamento),
    confirmarRevisaoHumana: new ConfirmarRevisaoHumana(criarRepositorioOrcamento, publisher),
  };
}

/**
 * Registra as 4 rotas REST deste contexto. `opts.preHandler` é a autenticação
 * Cognito (T025/#30): sem ele as rotas ficam abertas — aceitável apenas em
 * teste de contrato e execução local, nunca em produção.
 *
 * Todas as 4 rotas aceitam `opts` e devem recebê-lo para ter o preHandler.
 */
export function registrarRotasIngestaoIdentificacao(
  app: FastifyInstance,
  modulo: IngestaoIdentificacao,
  opts: RotaOpts = {},
): void {
  registrarRotaUploadUrl(app, modulo.armazenamento, opts);
  registrarRotaConfirmarUpload(app, modulo.armazenamento, modulo.receberOrcamento, opts);
  registrarRotaStatusOrcamento(app, modulo.consultarStatusOrcamento, opts);
  registrarRotaRevisaoHumana(app, modulo.confirmarRevisaoHumana, opts);
}
