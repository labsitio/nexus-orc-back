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
  const repositorio = new DrizzleOrcamentoRepository(deps.db);
  const idempotencia = new DrizzleIdempotencyKeyRepository(deps.db);
  const publisher = new EventBridgePublisher(deps.eventBridge, deps.eventBusName);
  const armazenamento = new S3ArmazenamentoBrutoGateway(deps.s3, deps.bucket);

  return {
    armazenamento,
    receberOrcamento: new ReceberOrcamento(repositorio, publisher, idempotencia),
    classificarOrcamento: new ClassificarOrcamento(
      repositorio,
      armazenamento,
      deps.conversor,
      deps.classificador,
      publisher,
      deps.cacheIdentificacao,
    ),
    consultarStatusOrcamento: new ConsultarStatusOrcamento(repositorio),
    confirmarRevisaoHumana: new ConfirmarRevisaoHumana(repositorio, publisher),
  };
}

/**
 * Registra as 4 rotas REST deste contexto. `opts.preHandler` é a autenticação
 * Cognito (T025/#30): sem ele as rotas ficam abertas — aceitável apenas em
 * teste de contrato e execução local, nunca em produção.
 *
 * `registrarRotaRevisaoHumana` não aceita `RotaOpts` hoje (assinatura mergeada
 * em T053/#58); quando aceitar, passar `opts` aqui também.
 */
export function registrarRotasIngestaoIdentificacao(
  app: FastifyInstance,
  modulo: IngestaoIdentificacao,
  opts: RotaOpts = {},
): void {
  registrarRotaUploadUrl(app, modulo.armazenamento, opts);
  registrarRotaConfirmarUpload(app, modulo.armazenamento, modulo.receberOrcamento, opts);
  registrarRotaStatusOrcamento(app, modulo.consultarStatusOrcamento, opts);
  registrarRotaRevisaoHumana(app, modulo.confirmarRevisaoHumana);
}
