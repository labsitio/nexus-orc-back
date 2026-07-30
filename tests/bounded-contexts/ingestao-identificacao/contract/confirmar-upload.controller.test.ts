import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceberOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.js';
import type { ArmazenamentoBrutoGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/armazenamento-bruto.gateway.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import type { IdempotencyKeyRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/idempotency-key.repository.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { registrarRotaConfirmarUpload } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/confirmar-upload.controller.js';

/** Contract test do controller real (T022/#27) — fakes de gateway/repositório/publisher/idempotência. */
function armazenamentoFake(referencia: ReferenciaS3 | undefined): ArmazenamentoBrutoGateway {
  return {
    armazenar: vi.fn(),
    lerConteudoBruto: vi.fn(),
    gerarUrlUpload: vi.fn(),
    obterReferenciaAposUpload: vi.fn().mockResolvedValue(referencia),
  };
}

function receberOrcamentoReal(): ReceberOrcamento {
  const repositorio: OrcamentoRepository = {
    salvar: vi.fn().mockResolvedValue(undefined),
    buscarPorId: vi.fn(),
  };
  const publisher: EventPublisher = { publicar: vi.fn().mockResolvedValue(undefined) };
  const idempotencia: IdempotencyKeyRepository = {
    buscarOrcamentoId: vi.fn().mockResolvedValue(undefined),
    registrar: vi.fn().mockResolvedValue(undefined),
  };
  return new ReceberOrcamento(repositorio, publisher, idempotencia);
}

describe('POST /v1/orcamentos/{orcamentoId}/confirmar-upload — controller', () => {
  let app: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await app.close();
  });

  it('200 com o mesmo orcamentoId quando o upload já foi concluído', async () => {
    const orcamentoId = OrcamentoId.novo();
    const referencia = ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: `pending-uploads/${orcamentoId.toString()}-orcamento.pdf`,
      versionId: 'v-1',
    });
    app = Fastify();
    registrarRotaConfirmarUpload(app, armazenamentoFake(referencia), receberOrcamentoReal());

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${orcamentoId.toString()}/confirmar-upload`,
      payload: { canal: 'PORTAL_WEB', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ orcamentoId: orcamentoId.toString() });
  });

  it('409 Problem Details quando o upload nunca foi concluído', async () => {
    app = Fastify();
    registrarRotaConfirmarUpload(app, armazenamentoFake(undefined), receberOrcamentoReal());

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${OrcamentoId.novo().toString()}/confirmar-upload`,
      payload: { canal: 'API_REST', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
  });

  it('400 Problem Details para orcamentoId mal formado', async () => {
    app = Fastify();
    registrarRotaConfirmarUpload(app, armazenamentoFake(undefined), receberOrcamentoReal());

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/nao-e-uuid/confirmar-upload',
      payload: { canal: 'API_REST', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('400 Problem Details para canal SFTP no corpo (não usa este fluxo)', async () => {
    app = Fastify();
    registrarRotaConfirmarUpload(app, armazenamentoFake(undefined), receberOrcamentoReal());

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${OrcamentoId.novo().toString()}/confirmar-upload`,
      payload: { canal: 'SFTP', nomeArquivo: 'orcamento.pdf' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('repassa Idempotency-Key ao ReceberOrcamento', async () => {
    const orcamentoId = OrcamentoId.novo();
    const referencia = ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' });
    const buscarOrcamentoId = vi.fn().mockResolvedValue(undefined);
    const registrar = vi.fn().mockResolvedValue(undefined);
    const repositorio: OrcamentoRepository = {
      salvar: vi.fn().mockResolvedValue(undefined),
      buscarPorId: vi.fn(),
    };
    const publisher: EventPublisher = { publicar: vi.fn().mockResolvedValue(undefined) };
    const receberOrcamento = new ReceberOrcamento(repositorio, publisher, {
      buscarOrcamentoId,
      registrar,
    });
    app = Fastify();
    registrarRotaConfirmarUpload(app, armazenamentoFake(referencia), receberOrcamento);

    await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${orcamentoId.toString()}/confirmar-upload`,
      payload: { canal: 'APP_MOBILE', nomeArquivo: 'x.pdf' },
      headers: { 'idempotency-key': 'chave-abc' },
    });

    expect(buscarOrcamentoId).toHaveBeenCalledWith('chave-abc');
    expect(registrar).toHaveBeenCalledWith('chave-abc', expect.anything(), expect.any(Date));
  });
});
