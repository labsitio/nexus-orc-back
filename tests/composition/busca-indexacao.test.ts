import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import type { AgenteEmbeddingGateway } from '../../src/bounded-contexts/busca-indexacao/domain/gateways/agente-embedding.gateway.js';
import { BedrockEmbeddingGateway } from '../../src/bounded-contexts/busca-indexacao/infrastructure/bedrock-embedding.gateway.js';
import { BedrockInterpretadorConsultaGateway } from '../../src/bounded-contexts/busca-indexacao/infrastructure/bedrock-interpretador-consulta.gateway.js';
import { OllamaEmbeddingGateway } from '../../src/bounded-contexts/busca-indexacao/infrastructure/ollama-embedding.gateway.js';
import { OllamaInterpretadorConsultaGateway } from '../../src/bounded-contexts/busca-indexacao/infrastructure/ollama-interpretador-consulta.gateway.js';
import {
  criarBuscaIndexacao,
  selecionarAgenteEmbedding,
  selecionarAgenteInterpretador,
} from '../../src/composition/busca-indexacao.js';
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
      embeddingGateway: stub<AgenteEmbeddingGateway>(),
    });

    expect(modulo.indexarOrcamento).toBeDefined();
    expect(modulo.acl).toBeDefined();
  });

  it('indexarOrcamento.executar delega por mensagem (nunca reaproveita repositório entre tenants)', async () => {
    const modulo = criarBuscaIndexacao({
      db: stub<NodePgDatabase>(),
      eventBridge: stub<EventBridgeClient>(),
      eventBusName: 'nexo-dominio-bus',
      embeddingGateway: stub<AgenteEmbeddingGateway>(),
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

/**
 * `selecionarAgenteEmbedding` (issue #620, ADR-009) — mesmo contrato de
 * `selecionarAgenteExtrator` (issue #619). Injeta o valor por parâmetro em
 * vez de `process.env` para não deixar teste dependente de ordem de execução.
 */
describe('selecionarAgenteEmbedding', () => {
  it('NEXO_AGENTE_IA=bedrock constrói BedrockEmbeddingGateway', () => {
    const gateway = selecionarAgenteEmbedding(
      {
        bedrock: { client: stub<BedrockRuntimeClient>(), modelId: 'amazon.titan-embed-text-v2:0' },
      },
      'bedrock',
    );
    expect(gateway).toBeInstanceOf(BedrockEmbeddingGateway);
  });

  it('NEXO_AGENTE_IA=local constrói OllamaEmbeddingGateway', () => {
    const gateway = selecionarAgenteEmbedding(
      { ollama: { baseUrl: 'http://localhost:11434', modelo: 'mxbai-embed-large' } },
      'local',
    );
    expect(gateway).toBeInstanceOf(OllamaEmbeddingGateway);
  });

  it('lança erro se NEXO_AGENTE_IA=bedrock sem config.bedrock', () => {
    expect(() => selecionarAgenteEmbedding({}, 'bedrock')).toThrow(/config.bedrock/);
  });

  it('lança erro se NEXO_AGENTE_IA=local sem config.ollama', () => {
    expect(() => selecionarAgenteEmbedding({}, 'local')).toThrow(/config.ollama/);
  });

  it('falha rápido se NEXO_AGENTE_IA estiver ausente ou com valor inválido', () => {
    expect(() => selecionarAgenteEmbedding({}, undefined)).toThrow(/local.*bedrock/);
    expect(() => selecionarAgenteEmbedding({}, 'outro')).toThrow(/local.*bedrock/);
  });
});

/**
 * `selecionarAgenteInterpretador` (issue #746, ADR-009) — mesmo contrato de
 * `selecionarAgenteEmbedding`/`selecionarAgenteExtrator`.
 */
describe('selecionarAgenteInterpretador', () => {
  it('NEXO_AGENTE_IA=bedrock constrói BedrockInterpretadorConsultaGateway', () => {
    const gateway = selecionarAgenteInterpretador(
      { bedrock: { client: stub<BedrockRuntimeClient>(), modelId: 'anthropic.claude-3-haiku' } },
      'bedrock',
    );
    expect(gateway).toBeInstanceOf(BedrockInterpretadorConsultaGateway);
  });

  it('NEXO_AGENTE_IA=local constrói OllamaInterpretadorConsultaGateway', () => {
    const gateway = selecionarAgenteInterpretador(
      { ollama: { baseUrl: 'http://localhost:11434', modelo: 'llama3.1' } },
      'local',
    );
    expect(gateway).toBeInstanceOf(OllamaInterpretadorConsultaGateway);
  });

  it('lança erro se NEXO_AGENTE_IA=bedrock sem config.bedrock', () => {
    expect(() => selecionarAgenteInterpretador({}, 'bedrock')).toThrow(/config.bedrock/);
  });

  it('lança erro se NEXO_AGENTE_IA=local sem config.ollama', () => {
    expect(() => selecionarAgenteInterpretador({}, 'local')).toThrow(/config.ollama/);
  });

  it('falha rápido se NEXO_AGENTE_IA estiver ausente ou com valor inválido', () => {
    expect(() => selecionarAgenteInterpretador({}, undefined)).toThrow(/local.*bedrock/);
    expect(() => selecionarAgenteInterpretador({}, 'outro')).toThrow(/local.*bedrock/);
  });
});
