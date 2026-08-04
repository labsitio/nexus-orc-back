import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import { OrcamentoRecebido } from '../../domain/events/orcamento-recebido.event.js';
import { Orcamento } from '../../domain/orcamento.aggregate.js';
import type { IdempotencyKeyRepository } from '../../domain/repositories/idempotency-key.repository.js';
import type { CriarOrcamentoRepositorio } from '../../domain/repositories/orcamento.repository.js';
import { Canal } from '../../domain/value-objects/canal.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import type { ReferenciaS3 } from '../../domain/value-objects/referencia-s3.vo.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';

/** TTL da chave de idempotência (plan.md, ADR de idempotência). */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface ReceberOrcamentoParams {
  readonly canal: string;
  /**
   * Referência do bruto já gravado no S3 — em todo canal real (confirmar-upload,
   * T022/#27, e trigger SFTP, T023/#28) o arquivo já está no bucket quando
   * `ReceberOrcamento` executa; este caso de uso nunca faz o PUT em si
   * (`ArmazenamentoBrutoGateway.armazenar` é usado antes, por quem já tem o
   * arquivo em mãos, se algum canal futuro precisar).
   */
  readonly referenciaBruta: ReferenciaS3;
  readonly referenciaExterna?: string;
  /** Header `Idempotency-Key` — opcional, os 3 canais de upload via API o suportam. */
  readonly idempotencyKey?: string;
  /**
   * `OrcamentoId` provisório já gerado por `POST /upload-url` (T021/#26) —
   * `confirmar-upload` (T022/#27) o repassa aqui para que a identidade
   * devolvida ao cliente na 1ª chamada seja a mesma persistida na 2ª.
   * Omitido nos canais que não passam por upload-url (ex. SFTP, T023/#28).
   */
  readonly orcamentoId?: OrcamentoId;
  /**
   * (spec 007, T016) Vem sempre do `TenantContext` já validado (JWT Cognito
   * nos 3 canais HTTP; mapeamento usuário/servidor SFTP via
   * `SftpTenantResolverGateway`) — NUNCA do body da requisição, isso seria
   * escalonamento de privilégio (cliente escolheria o próprio tenant).
   */
  readonly tenantId: TenantId;
}

/**
 * Caso de uso `ReceberOrcamento` (T020/#25): cria o agregado a partir de uma
 * referência de bruto já gravada, persiste e publica `OrcamentoRecebido`.
 * Com `idempotencyKey` repetida dentro do TTL, devolve o `OrcamentoId` já
 * existente sem repetir nenhum efeito colateral (sem novo persist/publish).
 */
export class ReceberOrcamento {
  constructor(
    private readonly criarRepositorio: CriarOrcamentoRepositorio,
    private readonly publisher: EventPublisher,
    private readonly idempotencia: IdempotencyKeyRepository,
  ) {}

  async executar(params: ReceberOrcamentoParams): Promise<OrcamentoId> {
    const canal = Canal.de(params.canal);
    const candidatoId = params.orcamentoId ?? OrcamentoId.novo();

    // Gate de admissão atômico (achado MAJOR do backend-reviewer): reserva
    // ANTES de qualquer persist/publish — nunca "ler se existe" e só depois
    // escrever, que sob concorrência deixa duas chamadas passarem juntas e
    // publicarem `OrcamentoRecebido` duplicado para a mesma Idempotency-Key.
    if (params.idempotencyKey) {
      const reserva = await this.idempotencia.reservar(
        params.idempotencyKey,
        candidatoId,
        new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      );
      if (!reserva.reservado) {
        return reserva.orcamentoId;
      }
    }

    const orcamento = Orcamento.receber({
      id: candidatoId,
      canal,
      referenciaBruta: params.referenciaBruta,
      referenciaExterna: params.referenciaExterna,
      tenantId: params.tenantId,
    });
    // (spec 007, T018) Repositório construído por chamada a partir do
    // `tenantId` já validado do parâmetro — nunca reaproveitado como campo
    // fixo entre chamadas (ver `CriarOrcamentoRepositorio`).
    await this.criarRepositorio(params.tenantId).salvar(orcamento);

    await this.publisher.publicar(
      new OrcamentoRecebido(
        orcamento.id.toString(),
        canal.valor,
        {
          bucket: params.referenciaBruta.bucket,
          key: params.referenciaBruta.key,
          versionId: params.referenciaBruta.versionId,
        },
        params.tenantId.toString(),
        params.referenciaExterna,
      ),
    );

    return orcamento.id;
  }
}
