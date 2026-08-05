import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { S3Client } from '@aws-sdk/client-s3';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { ExtrairDadosOrcamento } from '../bounded-contexts/extracao/application/use-cases/extrair-dados-orcamento.js';
import type { AgenteExtratorGateway } from '../bounded-contexts/extracao/domain/gateways/agente-extrator.gateway.js';
import type { MarkItDownConversaoExtracaoACL } from '../bounded-contexts/extracao/domain/gateways/markitdown-conversao-extracao.acl.js';
import { EventBridgePublisher } from '../bounded-contexts/extracao/infrastructure/eventbridge.publisher.js';
import { DrizzleExtracaoOrcamentoRepository } from '../bounded-contexts/extracao/infrastructure/persistence/drizzle-extracao-orcamento.repository.js';
import { S3LeituraBrutaGateway } from '../bounded-contexts/extracao/infrastructure/s3-leitura-bruta.gateway.js';
import { criarTenantContext } from '../shared-kernel/tenant/tenant-context.js';
import type { TenantId } from '../shared-kernel/tenant/tenant-id.vo.js';

/**
 * Composition root do BC Extração. Simétrico ao de Ingestão e deliberadamente
 * separado: cada BC tem seu próprio `EventBridgePublisher` (mesmo bus físico,
 * `source` distinto) e seu próprio wiring — nenhum import cruzado entre os
 * dois contextos, a fronteira só se encontra aqui, na composição.
 */
export interface ExtracaoDeps {
  readonly db: NodePgDatabase;
  /** Leitura read-only do bucket de bruto, propriedade da Ingestão. */
  readonly s3: S3Client;
  readonly eventBridge: EventBridgeClient;
  readonly eventBusName: string;
  readonly extrator: AgenteExtratorGateway;
  readonly conversor: MarkItDownConversaoExtracaoACL;
}

export interface Extracao {
  readonly extrairDadosOrcamento: ExtrairDadosOrcamento;
}

export function criarExtracao(deps: ExtracaoDeps): Extracao {
  // (issue #656, spec 007/T008) `DrizzleExtracaoOrcamentoRepository` estende
  // `DrizzleTenantScopedRepositoryBase` — o `TenantContext` é fixado no
  // construtor e MUST NUNCA ser reaproveitado entre tenants, então esta
  // composition root só constrói uma fábrica `(tenantId) => repo`, mesmo
  // padrão de `criarIngestaoIdentificacao` (spec 001/T018).
  const criarRepositorioExtracao = (tenantId: TenantId) =>
    new DrizzleExtracaoOrcamentoRepository(deps.db, criarTenantContext(tenantId));

  return {
    extrairDadosOrcamento: new ExtrairDadosOrcamento(
      criarRepositorioExtracao,
      new S3LeituraBrutaGateway(deps.s3),
      deps.conversor,
      deps.extrator,
      new EventBridgePublisher(deps.eventBridge, deps.eventBusName),
    ),
  };
}
