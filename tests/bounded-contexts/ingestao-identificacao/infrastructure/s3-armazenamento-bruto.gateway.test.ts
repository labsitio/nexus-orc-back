import type { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describe, expect, it, vi } from 'vitest';
import {
  chaveUploadPendente,
  S3ArmazenamentoBrutoGateway,
} from '../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/s3-armazenamento-bruto.gateway.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

function s3ClientFake(send: (command: unknown) => unknown): S3Client {
  return { send } as unknown as S3Client;
}

describe('S3ArmazenamentoBrutoGateway', () => {
  it('armazenar grava no prefixo do canal e devolve ReferenciaS3 com a versionId do S3', async () => {
    const send = vi.fn().mockResolvedValue({ VersionId: 'v-123' });
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(send), 'nexo-orcamentos-raw');

    const referencia = await gateway.armazenar('SFTP', new Uint8Array([1, 2, 3]), 'orcamento.pdf');

    expect(referencia.bucket).toBe('nexo-orcamentos-raw');
    expect(referencia.key).toMatch(/^sftp-incoming\/.+-orcamento\.pdf$/);
    expect(referencia.versionId).toBe('v-123');
  });

  it('armazenar lança erro se o bucket não devolver VersionId (bucket sem versionamento)', async () => {
    const send = vi.fn().mockResolvedValue({});
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(send), 'nexo-orcamentos-raw');

    await expect(gateway.armazenar('PORTAL_WEB', new Uint8Array([1]), 'a.pdf')).rejects.toThrow(
      /VersionId/,
    );
  });

  it('lerConteudoBruto lê pela versionId explícita da referência', async () => {
    const conteudo = new Uint8Array([9, 9, 9]);
    const send = vi.fn().mockResolvedValue({
      Body: { transformToByteArray: async () => conteudo },
    });
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(send), 'nexo-orcamentos-raw');

    const lido = await gateway.lerConteudoBruto(
      ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'sftp-incoming/x.pdf',
        versionId: 'v-1',
      }),
    );

    expect(lido).toBe(conteudo);
  });

  it('lerConteudoBruto lança erro se o S3 não devolver Body', async () => {
    const send = vi.fn().mockResolvedValue({});
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(send), 'nexo-orcamentos-raw');

    await expect(
      gateway.lerConteudoBruto(
        ReferenciaS3.de({
          bucket: 'nexo-orcamentos-raw',
          key: 'sftp-incoming/x.pdf',
          versionId: 'v-1',
        }),
      ),
    ).rejects.toThrow(/Body/);
  });

  it('gerarUrlUpload assina PutObject na chave determinística pending-uploads/<orcamentoId>-<nomeArquivo>', async () => {
    vi.mocked(getSignedUrl).mockResolvedValue('https://s3.exemplo/presigned?sig=abc');
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(vi.fn()), 'nexo-orcamentos-raw');
    const orcamentoId = OrcamentoId.novo();

    const url = await gateway.gerarUrlUpload(orcamentoId, 'orcamento.pdf');

    expect(url).toBe('https://s3.exemplo/presigned?sig=abc');
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const [, comando, opcoes] = vi.mocked(getSignedUrl).mock.calls[0]!;
    expect((comando as PutObjectCommand).input.Bucket).toBe('nexo-orcamentos-raw');
    expect((comando as PutObjectCommand).input.Key).toBe(
      chaveUploadPendente(orcamentoId, 'orcamento.pdf'),
    );
    expect(opcoes).toMatchObject({ expiresIn: 15 * 60 });
  });

  it('obterReferenciaAposUpload devolve a ReferenciaS3 quando o HeadObject encontra o objeto', async () => {
    const orcamentoId = OrcamentoId.novo();
    const send = vi.fn().mockResolvedValue({ VersionId: 'v-999' });
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(send), 'nexo-orcamentos-raw');

    const referencia = await gateway.obterReferenciaAposUpload(orcamentoId, 'orcamento.pdf');

    expect(referencia).toEqual(
      ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: chaveUploadPendente(orcamentoId, 'orcamento.pdf'),
        versionId: 'v-999',
      }),
    );
  });

  it('obterReferenciaAposUpload devolve undefined quando o objeto não existe (upload não concluído)', async () => {
    const erroNaoEncontrado = Object.assign(new Error('not found'), { name: 'NotFound' });
    const send = vi.fn().mockRejectedValue(erroNaoEncontrado);
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(send), 'nexo-orcamentos-raw');

    const referencia = await gateway.obterReferenciaAposUpload(OrcamentoId.novo(), 'x.pdf');

    expect(referencia).toBeUndefined();
  });

  it('obterReferenciaAposUpload propaga erro inesperado do S3 (não mascara como upload ausente)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('acesso negado'));
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(send), 'nexo-orcamentos-raw');

    await expect(gateway.obterReferenciaAposUpload(OrcamentoId.novo(), 'x.pdf')).rejects.toThrow(
      /acesso negado/,
    );
  });

  it('obterReferenciaAposUpload lança erro se o HeadObject não devolver VersionId', async () => {
    const send = vi.fn().mockResolvedValue({});
    const gateway = new S3ArmazenamentoBrutoGateway(s3ClientFake(send), 'nexo-orcamentos-raw');

    await expect(gateway.obterReferenciaAposUpload(OrcamentoId.novo(), 'x.pdf')).rejects.toThrow(
      /VersionId/,
    );
  });
});
