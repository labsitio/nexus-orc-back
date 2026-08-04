import Fastify from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import {
  criarIngestaoIdentificacao,
  registrarRotasIngestaoIdentificacao,
} from '../../src/composition/ingestao-identificacao.js';

/**
 * Guarda da composition root: se um controller for renomeado, ganhar um
 * parâmetro novo ou deixar de ser registrado, a composição para de expor a rota
 * e este teste falha — antes de alguém descobrir por `curl` no ambiente local.
 *
 * Nenhum I/O acontece aqui: `criarIngestaoIdentificacao` só instancia
 * repositórios e gateways (todos preguiçosos quanto a conexão), então stubs
 * vazios bastam para verificar o wiring.
 */
const ROTAS_ESPERADAS = [
  { method: 'POST', url: '/v1/orcamentos/upload-url' },
  { method: 'POST', url: '/v1/orcamentos/:orcamentoId/confirmar-upload' },
  { method: 'GET', url: '/v1/orcamentos/:orcamentoId/status' },
  { method: 'POST', url: '/v1/orcamentos/:orcamentoId/revisao-humana' },
] as const;

function stub<T>(): T {
  return {} as T;
}

describe('composition root de ingestao-identificacao', () => {
  it('expõe as 4 rotas REST do contexto', async () => {
    const app = Fastify();
    const modulo = criarIngestaoIdentificacao({
      db: stub<NodePgDatabase>(),
      s3: stub<S3Client>(),
      eventBridge: stub<EventBridgeClient>(),
      bucket: 'nexo-orcamentos-raw',
      eventBusName: 'nexo-dominio-bus',
      classificador: { classificar: async () => ({}) as never },
      conversor: { converterParaTexto: async () => '' },
    });

    registrarRotasIngestaoIdentificacao(app, modulo);
    await app.ready();

    for (const rota of ROTAS_ESPERADAS) {
      expect(
        app.hasRoute({ method: rota.method, url: rota.url }),
        `${rota.method} ${rota.url}`,
      ).toBe(true);
    }

    await app.close();
  });
});
