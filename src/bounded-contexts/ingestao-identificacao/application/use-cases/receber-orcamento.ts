import type { ArmazenamentoBrutoGateway } from '../../domain/gateways/armazenamento-bruto.gateway.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import { OrcamentoRecebido } from '../../domain/events/orcamento-recebido.event.js';
import { Orcamento } from '../../domain/orcamento.aggregate.js';
import type { IdempotencyKeyRepository } from '../../domain/repositories/idempotency-key.repository.js';
import type { OrcamentoRepository } from '../../domain/repositories/orcamento.repository.js';
import { Canal } from '../../domain/value-objects/canal.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';

/** TTL da chave de idempotência (plan.md, ADR de idempotência). */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface ReceberOrcamentoParams {
  readonly canal: string;
  readonly conteudo: Uint8Array;
  readonly nomeArquivo: string;
  readonly referenciaExterna?: string;
  /** Header `Idempotency-Key` — opcional, os 3 canais de upload via API o suportam. */
  readonly idempotencyKey?: string;
}

/**
 * Caso de uso `ReceberOrcamento` (T020/#25): grava o bruto no S3, cria o
 * agregado, persiste e publica `OrcamentoRecebido`. Com `idempotencyKey`
 * repetida dentro do TTL, devolve o `OrcamentoId` já existente sem repetir
 * nenhum efeito colateral (sem novo upload/persist/publish).
 */
export class ReceberOrcamento {
  constructor(
    private readonly armazenamento: ArmazenamentoBrutoGateway,
    private readonly repositorio: OrcamentoRepository,
    private readonly publisher: EventPublisher,
    private readonly idempotencia: IdempotencyKeyRepository,
  ) {}

  async executar(params: ReceberOrcamentoParams): Promise<OrcamentoId> {
    if (params.idempotencyKey) {
      const existente = await this.idempotencia.buscarOrcamentoId(params.idempotencyKey);
      if (existente) {
        return existente;
      }
    }

    const canal = Canal.de(params.canal);
    const referenciaBruta = await this.armazenamento.armazenar(
      canal.valor,
      params.conteudo,
      params.nomeArquivo,
    );

    const orcamento = Orcamento.receber({
      id: OrcamentoId.novo(),
      canal,
      referenciaBruta,
      referenciaExterna: params.referenciaExterna,
    });
    await this.repositorio.salvar(orcamento);

    await this.publisher.publicar(
      new OrcamentoRecebido(
        orcamento.id.toString(),
        canal.valor,
        {
          bucket: referenciaBruta.bucket,
          key: referenciaBruta.key,
          versionId: referenciaBruta.versionId,
        },
        params.referenciaExterna,
      ),
    );

    if (params.idempotencyKey) {
      await this.idempotencia.registrar(
        params.idempotencyKey,
        orcamento.id,
        new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      );
    }

    return orcamento.id;
  }
}
