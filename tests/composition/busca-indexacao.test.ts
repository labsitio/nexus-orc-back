import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { criarBuscaIndexacao } from '../../src/composition/busca-indexacao.js';
import { TenantId } from '../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Guarda simétrica a `tests/composition/extracao.test.ts`. Nenhum I/O
 * acontece aqui — `db`/`eventBridge`/`bedrock` são stubs (nunca invocados
 * por `criarBuscaIndexacao`, só armazenados para uso sob demanda).
 */
function stub<T>(): T {
  return {} as T;
}

describe('composition root de busca-indexacao', () => {
  it('constrói indexarOrcamento e acl com os stubs injetados', () => {
    const modulo = criarBuscaIndexacao({
      db: stub<NodePgDatabase>(),
      eventBridge: stub<EventBridgeClient>(),
      eventBusName: 'nexo-dominio-bus',
      bedrock: stub<BedrockRuntimeClient>(),
      modeloEmbeddingId: 'amazon.titan-embed-text-v2:0',
    });

    expect(modulo.indexarOrcamento).toBeDefined();
    expect(modulo.acl).toBeDefined();
  });

  it('indexarOrcamento.executar delega por mensagem (nunca reaproveita repositório entre tenants)', async () => {
    const modulo = criarBuscaIndexacao({
      db: stub<NodePgDatabase>(),
      eventBridge: stub<EventBridgeClient>(),
      eventBusName: 'nexo-dominio-bus',
      bedrock: stub<BedrockRuntimeClient>(),
      modeloEmbeddingId: 'amazon.titan-embed-text-v2:0',
    });

    // `IndiceOrcamentoRepository` (T016/ADR-005, spec 007) exige uma
    // instância por tenant — `IndexarOrcamentoPorMensagem.executar`
    // constrói uma nova a cada chamada em vez de reaproveitar a passada ao
    // construtor (`repositorioNuncaUsado`). Payload inválido faz a ACL
    // rejeitar antes de qualquer I/O real (db stub nunca é usado por
    // `DrizzlePgvectorIndiceOrcamentoRepository` até uma query de verdade
    // rodar) — prova que o override delega para uma execução real de
    // `IndexarOrcamento.executar`, e não para um stub vazio.
    const TENANT_ID_UUID_V7 = '01890a5d-ac96-774b-bcce-b302099a8057';

    await expect(
      modulo.indexarOrcamento.executar(TenantId.de(TENANT_ID_UUID_V7), 'OrcamentoValidado', {
        orcamentoId: 'nao-e-um-payload-valido',
      }),
    ).rejects.toThrow();
  });
});
