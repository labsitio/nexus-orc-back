import { describe, expect, it, vi } from 'vitest';
import { ReceberOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/receber-orcamento.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import { OrcamentoRecebido } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-recebido.event.js';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import type {
  IdempotencyKeyRepository,
  ReservaIdempotencia,
} from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/idempotency-key.repository.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

function repositorioFake(): OrcamentoRepository {
  return { salvar: vi.fn().mockResolvedValue(undefined), buscarPorId: vi.fn() };
}

function publisherFake(): EventPublisher {
  return { publicar: vi.fn().mockResolvedValue(undefined) };
}

/** `existente` simula outra tentativa que já venceu a corrida de reserva. */
function idempotenciaFake(existente?: OrcamentoId): IdempotencyKeyRepository {
  return {
    reservar: vi.fn(
      async (_chave: string, orcamentoId: OrcamentoId): Promise<ReservaIdempotencia> =>
        existente ? { reservado: false, orcamentoId: existente } : { reservado: true, orcamentoId },
    ),
  };
}

describe('ReceberOrcamento', () => {
  it('persiste o agregado a partir da referência já gravada e publica OrcamentoRecebido', async () => {
    const referencia = ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'sftp-incoming/x.pdf',
      versionId: 'v-1',
    });
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake();
    const useCase = new ReceberOrcamento(repositorio, publisher, idempotencia);
    const tenantId = TenantId.novo();

    const orcamentoId = await useCase.executar({ canal: 'SFTP', referenciaBruta: referencia, tenantId });

    expect(repositorio.salvar).toHaveBeenCalledTimes(1);
    const salvo = vi.mocked(repositorio.salvar).mock.calls[0]?.[0] as Orcamento;
    expect(salvo.id.toString()).toBe(orcamentoId.toString());
    expect(salvo.status).toBe('RECEBIDO');
    expect(salvo.tenantId?.equals(tenantId)).toBe(true);

    expect(publisher.publicar).toHaveBeenCalledTimes(1);
    const evento = vi.mocked(publisher.publicar).mock.calls[0]?.[0] as OrcamentoRecebido;
    expect(evento.detailType).toBe('OrcamentoRecebido');
    expect(evento.orcamentoId).toBe(orcamentoId.toString());
    expect(evento.referenciaBruta).toEqual({
      bucket: 'nexo-orcamentos-raw',
      key: 'sftp-incoming/x.pdf',
      versionId: 'v-1',
    });
    expect(idempotencia.reservar).not.toHaveBeenCalled();
  });

  it('usa o orcamentoId provisório informado (upload-url -> confirmar-upload) em vez de gerar um novo', async () => {
    const provisorio = OrcamentoId.novo();
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake();
    const useCase = new ReceberOrcamento(repositorio, publisher, idempotencia);

    const orcamentoId = await useCase.executar({
      canal: 'PORTAL_WEB',
      referenciaBruta: ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
      orcamentoId: provisorio,
      tenantId: TenantId.novo(),
    });

    expect(orcamentoId.toString()).toBe(provisorio.toString());
  });

  it('com Idempotency-Key já reservada por outra tentativa (perdeu a corrida), devolve o OrcamentoId vencedor sem persistir/publicar', async () => {
    const existente = OrcamentoId.novo();
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake(existente);
    const useCase = new ReceberOrcamento(repositorio, publisher, idempotencia);

    const orcamentoId = await useCase.executar({
      canal: 'API_REST',
      referenciaBruta: ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
      idempotencyKey: 'chave-repetida',
      tenantId: TenantId.novo(),
    });

    expect(orcamentoId.toString()).toBe(existente.toString());
    expect(repositorio.salvar).not.toHaveBeenCalled();
    expect(publisher.publicar).not.toHaveBeenCalled();
  });

  it('com Idempotency-Key nova, reserva ANTES de persistir/publicar (gate de admissão) e executa o fluxo normal', async () => {
    const referencia = ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' });
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake(undefined);
    const useCase = new ReceberOrcamento(repositorio, publisher, idempotencia);

    const orcamentoId = await useCase.executar({
      canal: 'PORTAL_WEB',
      referenciaBruta: referencia,
      idempotencyKey: 'chave-nova',
      tenantId: TenantId.novo(),
    });

    expect(idempotencia.reservar).toHaveBeenCalledTimes(1);
    const [chave, idReservado, expiraEm] = vi.mocked(idempotencia.reservar).mock.calls[0]!;
    expect(chave).toBe('chave-nova');
    expect((idReservado as OrcamentoId).toString()).toBe(orcamentoId.toString());
    expect((expiraEm as Date).getTime()).toBeGreaterThan(Date.now());
    expect(repositorio.salvar).toHaveBeenCalledTimes(1);
    expect(publisher.publicar).toHaveBeenCalledTimes(1);
  });

  it('rejeita canal fora dos 4 fixos sem reservar idempotência, persistir ou publicar', async () => {
    const repositorio = repositorioFake();
    const publisher = publisherFake();
    const idempotencia = idempotenciaFake();
    const useCase = new ReceberOrcamento(repositorio, publisher, idempotencia);

    await expect(
      useCase.executar({
        canal: 'FAX',
        referenciaBruta: ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
        idempotencyKey: 'chave-x',
        tenantId: TenantId.novo(),
      }),
    ).rejects.toThrow(/Canal inválido/);
    expect(idempotencia.reservar).not.toHaveBeenCalled();
    expect(repositorio.salvar).not.toHaveBeenCalled();
  });
});
