import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArmazenamentoBrutoGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/armazenamento-bruto.gateway.js';
import { registrarRotaUploadUrl } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/upload-url.controller.js';

/** Contract test do controller real (T021/#26), fake do gateway (sem S3 real). */
function armazenamentoFake(url = 'https://s3.exemplo/presigned'): ArmazenamentoBrutoGateway {
  return {
    armazenar: vi.fn(),
    lerConteudoBruto: vi.fn(),
    gerarUrlUpload: vi.fn().mockResolvedValue(url),
    obterReferenciaAposUpload: vi.fn(),
  };
}

describe('POST /v1/orcamentos/upload-url — controller', () => {
  let app: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await app.close();
  });

  it('201 com orcamentoId (UUID v7) + uploadUrl, sem persistir nada', async () => {
    const armazenamento = armazenamentoFake('https://s3.exemplo/presigned?sig=abc');
    app = Fastify();
    registrarRotaUploadUrl(app, armazenamento);

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/upload-url',
      payload: { canal: 'PORTAL_WEB', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json();
    expect(corpo.orcamentoId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(corpo.uploadUrl).toBe('https://s3.exemplo/presigned?sig=abc');
    expect(armazenamento.gerarUrlUpload).toHaveBeenCalledTimes(1);
    expect(armazenamento.armazenar).not.toHaveBeenCalled();
  });

  it('400 Problem Details para canal SFTP (não usa este fluxo, ADR-002)', async () => {
    app = Fastify();
    registrarRotaUploadUrl(app, armazenamentoFake());

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/upload-url',
      payload: { canal: 'SFTP', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details para nomeArquivo vazio', async () => {
    app = Fastify();
    registrarRotaUploadUrl(app, armazenamentoFake());

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/upload-url',
      payload: { canal: 'API_REST', nomeArquivo: '' },
    });

    expect(resposta.statusCode).toBe(400);
  });
});
