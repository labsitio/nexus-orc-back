import { describe, expect, it, vi } from 'vitest';
import { ReceberOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.js';
import type { ArmazenamentoBrutoGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/armazenamento-bruto.gateway.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import { OrcamentoRecebido } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-recebido.event.js';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import type { IdempotencyKeyRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/idempotency-key.repository.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';

function armazenamentoFake(referencia: ReferenciaS3): ArmazenamentoBrutoGateway {
  return {
    armazenar: vi.fn().mockResolvedValue(referencia),
    lerConteudoBruto: vi.fn(),
  };
}

function repositorioFake(): OrcamentoRepository {
  return { salvar: vi.fn().mockResolvedValue(undefined), buscarPorId: vi.fn() };
}

function publisherFake(): EventPublisher {
  return { publicar: vi.fn().mockResolvedValue(undefined) };
}

function idempotenciaFake(existente?: OrcamentoId): IdempotencyKeyRepository {
  return {
    buscarOrcamentoId: vi.fn().mockResolvedValue(existente),
    registrar: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ReceberOrcamento', () => {
  it('grava o bruto, persiste o agregado e publica OrcamentoRecebido', async () => {
    const referencia = ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'sftp-incoming/x.pdf',
      versionId: 'v-1',
    });
    const armazenamento = armazenamentoFake(referencia);
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake();
    const useCase = new ReceberOrcamento(armazenamento, repositorio, publisher, idempotencia);

    const orcamentoId = await useCase.executar({
      canal: 'SFTP',
      conteudo: new Uint8Array([1, 2, 3]),
      nomeArquivo: 'x.pdf',
    });

    expect(armazenamento.armazenar).toHaveBeenCalledWith('SFTP', expect.any(Uint8Array), 'x.pdf');
    expect(repositorio.salvar).toHaveBeenCalledTimes(1);
    const salvo = vi.mocked(repositorio.salvar).mock.calls[0]?.[0] as Orcamento;
    expect(salvo.id.toString()).toBe(orcamentoId.toString());
    expect(salvo.status).toBe('RECEBIDO');

    expect(publisher.publicar).toHaveBeenCalledTimes(1);
    const evento = vi.mocked(publisher.publicar).mock.calls[0]?.[0] as OrcamentoRecebido;
    expect(evento.detailType).toBe('OrcamentoRecebido');
    expect(evento.orcamentoId).toBe(orcamentoId.toString());
    expect(evento.referenciaBruta).toEqual({
      bucket: 'nexo-orcamentos-raw',
      key: 'sftp-incoming/x.pdf',
      versionId: 'v-1',
    });
  });

  it('com Idempotency-Key repetida dentro do TTL, devolve o OrcamentoId existente sem repetir efeito colateral', async () => {
    const existente = OrcamentoId.novo();
    const armazenamento = armazenamentoFake(
      ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
    );
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake(existente);
    const useCase = new ReceberOrcamento(armazenamento, repositorio, publisher, idempotencia);

    const orcamentoId = await useCase.executar({
      canal: 'API_REST',
      conteudo: new Uint8Array([1]),
      nomeArquivo: 'y.pdf',
      idempotencyKey: 'chave-repetida',
    });

    expect(orcamentoId.toString()).toBe(existente.toString());
    expect(armazenamento.armazenar).not.toHaveBeenCalled();
    expect(repositorio.salvar).not.toHaveBeenCalled();
    expect(publisher.publicar).not.toHaveBeenCalled();
  });

  it('com Idempotency-Key nova, executa o fluxo normal e registra a chave após publicar', async () => {
    const referencia = ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' });
    const armazenamento = armazenamentoFake(referencia);
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake(undefined);
    const useCase = new ReceberOrcamento(armazenamento, repositorio, publisher, idempotencia);

    const orcamentoId = await useCase.executar({
      canal: 'PORTAL_WEB',
      conteudo: new Uint8Array([1]),
      nomeArquivo: 'z.pdf',
      idempotencyKey: 'chave-nova',
    });

    expect(idempotencia.registrar).toHaveBeenCalledTimes(1);
    const [chave, idRegistrado, expiraEm] = vi.mocked(idempotencia.registrar).mock.calls[0]!;
    expect(chave).toBe('chave-nova');
    expect((idRegistrado as OrcamentoId).toString()).toBe(orcamentoId.toString());
    expect((expiraEm as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejeita canal fora dos 4 fixos sem chamar nenhum gateway', async () => {
    const armazenamento = armazenamentoFake(
      ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
    );
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake();
    const useCase = new ReceberOrcamento(armazenamento, repositorio, publisher, idempotencia);

    await expect(
      useCase.executar({ canal: 'FAX', conteudo: new Uint8Array([1]), nomeArquivo: 'a.pdf' }),
    ).rejects.toThrow(/Canal inválido/);
    expect(armazenamento.armazenar).not.toHaveBeenCalled();
  });
});
