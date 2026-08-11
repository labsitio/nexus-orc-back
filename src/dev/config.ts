/**
 * Configuração compartilhada pelos scripts de execução local (spec 001 T067 /
 * issue #589). Só `src/dev/**` importa daqui — nada de produção depende deste
 * arquivo.
 *
 * Os clientes AWS apontam para o LocalStack via `AWS_ENDPOINT_URL` (lido
 * nativamente pelo AWS SDK v3), exatamente como em produção apontariam para a
 * AWS real sem essa variável. Nenhum adaptador é trocado por ambiente: o mesmo
 * `S3ArmazenamentoBrutoGateway` e o mesmo `EventBridgePublisher` de produção
 * rodam aqui, só com outro endpoint.
 */
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';

export interface ConfigLocal {
  readonly bucket: string;
  readonly eventBusName: string;
  readonly porta: number;
  /** Confiança devolvida pelo classificador local — >=80 classifica, <80 escalona. */
  readonly confiancaClassificador: number;
  /** `true` deixa um campo obrigatório sem extrair, forçando escalonamento na spec 002. */
  readonly extracaoCampoFaltando: boolean;
  /** `local` (Ollama, ADR-009) ou `bedrock` — mesma leitura de `NEXO_AGENTE_IA` dos seletores de `src/composition/*.ts`. */
  readonly agenteIa: 'local' | 'bedrock';
  readonly ollamaBaseUrl: string;
  readonly ollamaModeloClassificador: string;
  readonly ollamaModeloEmbedding: string;
  readonly ollamaModeloOrquestrador: string;
  /**
   * UUID v7 fixo — substituto local da claim `custom:tenant_id` do JWT
   * Cognito (não existe Cognito em dev). Nunca em produção.
   */
  readonly tenantIdLocal: string;
  /** Substituto local da claim `cognito:groups`. Nunca em produção. */
  readonly papeisLocais: readonly string[];
}

function inteiroDoAmbiente(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') {
    return padrao;
  }
  const valor = Number(bruto);
  if (!Number.isInteger(valor)) {
    throw new Error(`${nome} deve ser um inteiro — recebido "${bruto}"`);
  }
  return valor;
}

export function configLocal(): ConfigLocal {
  return {
    bucket: process.env.NEXO_BUCKET_RAW ?? 'nexo-orcamentos-raw',
    eventBusName: process.env.NEXO_EVENT_BUS ?? 'nexo-dominio-bus',
    porta: inteiroDoAmbiente('PORT', 3000),
    confiancaClassificador: inteiroDoAmbiente('NEXO_LOCAL_CONFIANCA', 90),
    extracaoCampoFaltando: process.env.NEXO_LOCAL_EXTRACAO_CAMPO_FALTANDO === 'true',
    agenteIa: process.env.NEXO_AGENTE_IA === 'bedrock' ? 'bedrock' : 'local',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    ollamaModeloClassificador: process.env.OLLAMA_MODELO_CLASSIFICADOR ?? 'llama3.1',
    ollamaModeloEmbedding: process.env.OLLAMA_MODELO_EMBEDDING ?? 'mxbai-embed-large',
    ollamaModeloOrquestrador: process.env.OLLAMA_MODELO_ORQUESTRADOR ?? 'llama3.1',
    tenantIdLocal: process.env.NEXO_LOCAL_TENANT_ID ?? '018f4a3c-0000-7000-8000-000000000001',
    papeisLocais: (process.env.NEXO_LOCAL_PAPEIS ?? 'comprador-responsavel,compliance-admin')
      .split(',')
      .map((papel) => papel.trim())
      .filter((papel) => papel.length > 0),
  };
}

export function clientesLocais(): {
  s3: S3Client;
  eventBridge: EventBridgeClient;
  sqs: SQSClient;
} {
  if (!process.env.AWS_ENDPOINT_URL) {
    throw new Error(
      'AWS_ENDPOINT_URL não configurada — execução local exige apontar para o LocalStack (ver .env.example).',
    );
  }
  // `forcePathStyle` é necessário para S3 no LocalStack: sem ele o SDK monta
  // `http://bucket.localhost:4566` e a resolução de DNS falha.
  // `useQueueUrlAsEndpoint: false` mantém o endpoint do LocalStack: as QueueUrl
  // devolvidas apontam para `sqs.*.localhost.localstack.cloud`, que o SDK usaria
  // como endpoint (e avisaria em cada chamada).
  // `requestChecksumCalculation: 'WHEN_REQUIRED'` é obrigatório para a URL
  // presigned de upload funcionar: no default (`WHEN_SUPPORTED`) o SDK v3 assina
  // `x-amz-checksum-crc32` calculado sobre o corpo que ele conhece no momento da
  // assinatura — vazio — e o PUT real do cliente, com corpo de verdade, é
  // rejeitado com 400. Vale igual em produção, não é particularidade local.
  return {
    s3: new S3Client({ forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED' }),
    eventBridge: new EventBridgeClient({}),
    sqs: new SQSClient({ useQueueUrlAsEndpoint: false }),
  };
}
