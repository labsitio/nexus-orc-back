import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { AgenteExtratorGateway } from '../../domain/gateways/agente-extrator.gateway.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type { LeituraBrutaGateway } from '../../domain/gateways/leitura-bruta.gateway.js';
import type { MarkItDownConversaoExtracaoACL } from '../../domain/gateways/markitdown-conversao-extracao.acl.js';
import { ExtracaoEscalonadaParaRevisaoHumana } from '../../domain/events/extracao-escalonada-revisao-humana.event.js';
import { OrcamentoExtraido } from '../../domain/events/orcamento-extraido.event.js';
import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import { ExtracaoOrcamento } from '../../domain/extracao-orcamento.aggregate.js';
import type { ExtracaoOrcamentoRepository } from '../../domain/repositories/extracao-orcamento.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import {
  ReferenciaClassificacao,
  type ReferenciaClassificacaoParams,
} from '../../domain/value-objects/referencia-classificacao.vo.js';
import {
  ReferenciaS3,
  type ReferenciaS3Params,
} from '../../domain/value-objects/referencia-s3.vo.js';

export interface ExtrairDadosOrcamentoParams {
  readonly orcamentoId: string;
  readonly referenciaClassificacao: ReferenciaClassificacaoParams;
  readonly referenciaBrutaS3: ReferenciaS3Params;
  /**
   * (spec 007, ADR-008 — cutover de contract, #632) Vem do envelope
   * `OrcamentoClassificado` (spec 001), obrigatório desde `schemaVersion: 2`.
   * Extraído/validado pelo handler antes de chegar aqui (T023/#88).
   */
  readonly tenantId: TenantId;
}

/** Motivo registrado em `ExtracaoEscalonadaParaRevisaoHumana` (plan.md/ADR-003). */
const MOTIVO_CAMPO_SEM_CONFIANCA = '1+ campo obrigatório sem confiança suficiente';

/** Nunca deveria ocorrer — invariante de `ExtracaoOrcamento.registrarTentativaExtrator` (T009). */
export class ExtracaoInconsistenteError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(
      `ExtracaoOrcamento ${orcamentoId} está EXTRAIDO sem condicoesComerciais — invariante do agregado violada`,
    );
  }
}

/**
 * (spec 007, ADR-008 — cutover de contract, #632) Nunca deveria ocorrer: todo
 * `ExtracaoOrcamento.criar` neste caso de uso recebe `params.tenantId`
 * (obrigatório). Guarda de fail-fast contra reentrega de fila com um
 * agregado legado (pré-retrofit) sem `tenantId` persistido.
 */
export class ExtracaoSemTenantIdError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(
      `ExtracaoOrcamento ${orcamentoId} não possui tenantId — registro pré-retrofit incompatível com o envelope de evento obrigatório (ADR-008)`,
    );
  }
}

/**
 * Consumidor do evento `OrcamentoClassificado` via SQS `extrator-queue` (T022/#87).
 * Cria o agregado `ExtracaoOrcamento` na primeira tentativa (ou recupera o já
 * existente, idempotente contra entrega duplicada da fila) — nunca reinvoca o
 * Extrator quando a extração já saiu de `PENDENTE` (ADR-003: uma única tentativa
 * automática). Lê o bruto (read-only), converte via `MarkItDownConversaoExtracaoACL`,
 * invoca `AgenteExtratorGateway`, aplica `ExtracaoOrcamento.registrarTentativaExtrator`,
 * persiste e publica `OrcamentoExtraido` (todos os campos obrigatórios OK) ou
 * `ExtracaoEscalonadaParaRevisaoHumana` (1+ campo obrigatório sem confiança) — nunca
 * decide o evento fora da regra do agregado (plan.md).
 */
export class ExtrairDadosOrcamento {
  constructor(
    private readonly repositorio: ExtracaoOrcamentoRepository,
    private readonly leituraBruta: LeituraBrutaGateway,
    private readonly conversor: MarkItDownConversaoExtracaoACL,
    private readonly agenteExtrator: AgenteExtratorGateway,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(params: ExtrairDadosOrcamentoParams): Promise<void> {
    const orcamentoId = OrcamentoId.de(params.orcamentoId);
    const existente = await this.repositorio.buscarPorOrcamentoId(orcamentoId);

    if (existente && existente.status !== 'PENDENTE') {
      // Entrega duplicada da fila (at-least-once): a extração já avançou além
      // da primeira tentativa — nunca reprocessa nem republica (ADR-003).
      return;
    }

    // ponytail: se `existente` já tiver tenantId e `params.tenantId` divergir
    // (replay malformado/bug upstream — orcamentoId é UUID v7, colisão real
    // entre tenants não é um cenário esperado), o novo valor é descartado
    // silenciosamente aqui: `ExtracaoOrcamento` nunca sobrescreve tenantId
    // (imutável, `atualizarTenantId` sempre lança). Seguro, mas sem log de
    // anomalia — este use case não tem dependência de Logger hoje (nenhum
    // caso de uso de application a tem no código-base). Se o backend-reviewer
    // apontar necessidade real de observabilidade aqui, promover para
    // parâmetro de Logger nesta issue de retrofit, não antes.
    const extracao =
      existente ??
      ExtracaoOrcamento.criar(
        orcamentoId,
        ReferenciaClassificacao.de(params.referenciaClassificacao),
        ReferenciaS3.de(params.referenciaBrutaS3),
        params.tenantId,
      );

    const bruto = await this.leituraBruta.ler(extracao.referenciaBrutaS3);
    const textoConvertido = await this.conversor.converter(bruto);
    const resultado = await this.agenteExtrator.extrair({
      textoConvertido,
      referenciaClassificacao: extracao.referenciaClassificacao,
    });

    extracao.registrarTentativaExtrator(resultado.itens, resultado.condicoesComerciais);
    await this.repositorio.salvar(extracao);

    // (spec 007, ADR-008 — cutover de contract, #632) O evento carrega o
    // `tenantId` já persistido no agregado (fonte da verdade, imutável desde
    // a criação) — nunca `params.tenantId` diretamente: numa reentrega com
    // `tenantId` divergente do já registrado (ponytail acima, silenciosamente
    // descartado), o evento nunca deve reportar um tenant diferente do dono
    // real do agregado.
    const tenantId = extracao.tenantId;
    if (!tenantId) {
      throw new ExtracaoSemTenantIdError(extracao.orcamentoId.toString());
    }

    let evento: OrcamentoExtraido | ExtracaoEscalonadaParaRevisaoHumana;
    if (extracao.status === 'EXTRAIDO') {
      const condicoesComerciais = extracao.condicoesComerciais;
      if (!condicoesComerciais) {
        // Invariante do agregado (T009): status só chega a EXTRAIDO quando
        // `condicoesComerciais` está preenchido (`completo()`) — nunca deveria faltar aqui.
        throw new ExtracaoInconsistenteError(extracao.orcamentoId.toString());
      }
      evento = new OrcamentoExtraido(
        extracao.orcamentoId.toString(),
        extracao.itens.map((item) => item.paraPayload()),
        condicoesComerciais.paraPayload(),
        tenantId.toString(),
      );
    } else {
      evento = new ExtracaoEscalonadaParaRevisaoHumana(
        extracao.orcamentoId.toString(),
        MOTIVO_CAMPO_SEM_CONFIANCA,
        tenantId.toString(),
      );
    }
    await this.eventPublisher.publicar(evento);
  }
}
