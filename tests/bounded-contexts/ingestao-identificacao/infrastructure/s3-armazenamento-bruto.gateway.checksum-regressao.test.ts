import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { S3ArmazenamentoBrutoGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/s3-armazenamento-bruto.gateway.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';

// BUG-001: sem mock de `getSignedUrl` — este teste exercita a assinatura SigV4
// real do SDK, que é onde o checksum de corpo vazio é embutido na URL.

const credenciaisFake = { accessKeyId: 'test', secretAccessKey: 'test' };

function s3ClientDe(requestChecksumCalculation?: 'WHEN_REQUIRED' | 'WHEN_SUPPORTED'): S3Client {
  return new S3Client({
    region: 'us-east-1',
    credentials: credenciaisFake,
    ...(requestChecksumCalculation ? { requestChecksumCalculation } : {}),
  });
}

describe('BUG-001 — regressão de checksum na URL presigned de upload', () => {
  it('gerarUrlUpload com S3Client configurado WHEN_REQUIRED não inclui checksum de corpo vazio na URL', async () => {
    const gateway = new S3ArmazenamentoBrutoGateway(
      s3ClientDe('WHEN_REQUIRED'),
      'nexo-orcamentos-raw',
    );

    const url = await gateway.gerarUrlUpload(OrcamentoId.novo(), 'orcamento.pdf');

    expect(url).not.toContain('x-amz-checksum-');
    expect(url).not.toContain('x-amz-sdk-checksum-algorithm');
  });

  it('gerarUrlUpload com S3Client no default do SDK (WHEN_SUPPORTED) reproduz o defeito — inclui checksum de corpo vazio', async () => {
    const gateway = new S3ArmazenamentoBrutoGateway(
      s3ClientDe('WHEN_SUPPORTED'),
      'nexo-orcamentos-raw',
    );

    const url = await gateway.gerarUrlUpload(OrcamentoId.novo(), 'orcamento.pdf');

    expect(url).toContain('x-amz-checksum-crc32=AAAAAA%3D%3D');
  });
});
