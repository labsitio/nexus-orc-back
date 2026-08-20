import type { Logger } from 'pino';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { AgenteExtratorGateway } from '../../domain/gateways/agente-extrator.gateway.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type { LeituraBrutaGateway } from '../../domain/gateways/leitura-bruta.gateway.js';
import type { MarkItDownConversaoExtracaoACL } from '../../domain/gateways/markitdown-conversao-extracao.acl.js';
import { ExtracaoEscalonadaParaRevisaoHumana } from '../../domain/events/extracao-escalonada-revisao-humana.event.js';
import { OrcamentoExtraido } from '../../domain/events/orcamento-extraido.event.js';
import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import { ExtracaoOrcamento } from '../../domain/extracao-orcamento.aggregate.js';
import type { CondicoesComerciais } from '../../domain/value-objects/condicoes-comerciais.vo.js';
import type { ItemOrcamento } from '../../domain/value-objects/item-orcamento.vo.js';
import type { CriarExtracaoOrcamentoRepositorio } from '../../domain/repositories/extracao-orcamento.repository.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import {
  ReferenciaClassificacao,
  type ReferenciaClassificacaoParams,
} from '../../domain/value-objects/referencia-classificacao.vo.js';
import {
  ReferenciaS3,
  type ReferenciaS3Params,
} from '../../domain/value-objects/referencia-s3.vo.js';
import { criarLogger } from '../../infrastructure/observability/logger.js';
import { emitirMetrica } from '../../infrastructure/observability/metrica.js';

/** Nomes dos campos de `ItemOrcamento`, na ordem em que `CampoExtraido.extraido` é checado (T045/#110). */
const CAMPOS_ITEM = ['descricao', 'quantidade', 'precoUnitario'] as const;

/** Nomes dos campos de `CondicoesComerciais`, mesma finalidade (T045/#110). */
const CAMPOS_CONDICOES_COMERCIAIS = [
  'condicoesPagamento',
  'prazoValidade',
  'condicoesEntrega',
] as const;

/**
 * Emite `CampoMarcadoNaoExtraido` (ADR-016) uma vez por campo obrigatório com
 * `extraido === false` na tentativa — dimensão `campo` de baixíssima
 * cardinalidade (6 valores fixos). É contador de ocorrência, não taxa/percentual
 * calculada: taxa exigiria job periódico agregando o histórico, mecanismo que
 * não existe em nenhum artefato aprovado (mesmo escopo do T049/#54).
 */
function emitirMetricaCamposNaoExtraidos(
  logger: Logger,
  itens: readonly ItemOrcamento[],
  condicoesComerciais: CondicoesComerciais,
): void {
  for (const item of itens) {
    for (const campo of CAMPOS_ITEM) {
      if (!item[campo].extraido) {
        emitirMetrica(logger, 'CampoMarcadoNaoExtraido', 1, { dimensoes: { campo } });
      }
    }
  }
  for (const campo of CAMPOS_CONDICOES_COMERCIAIS) {
    if (!condicoesComerciais[campo].extraido) {
      emitirMetrica(logger, 'CampoMarcadoNaoExtraido', 1, { dimensoes: { campo } });
    }
  }
}

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
    private readonly criarRepositorio: CriarExtracaoOrcamentoRepositorio,
    private readonly leituraBruta: LeituraBrutaGateway,
    private readonly conversor: MarkItDownConversaoExtracaoACL,
    private readonly agenteExtrator: AgenteExtratorGateway,
    private readonly eventPublisher: EventPublisher,
    private readonly logger: Logger = criarLogger({ useCase: 'extrair-dados-orcamento' }),
  ) {}

  async executar(params: ExtrairDadosOrcamentoParams): Promise<void> {
    const orcamentoId = OrcamentoId.de(params.orcamentoId);
    // (issue #656) Repositório construído por chamada a partir do
    // `params.tenantId` já validado pelo handler — nunca reaproveitado como
    // campo fixo entre chamadas (mesmo padrão de `CriarOrcamentoRepositorio`,
    // spec 001).
    const repositorio = this.criarRepositorio(params.tenantId);
    const existente = await repositorio.buscarPorOrcamentoId(orcamentoId);

    if (existente && existente.status !== 'PENDENTE') {
      // Entrega duplicada da fila (at-least-once): a extração já avançou além
      // da primeira tentativa — nunca reprocessa nem republica (ADR-003).
      return;
    }

    // (issue #656 — aperto de tipo) `existente` só é retornado pelo
    // repositório se pertencer ao mesmo tenant desta chamada (RLS via
    // `transacaoTenantScoped`, T008) — `ExtracaoOrcamento.criar` sempre usa
    // `params.tenantId`, nunca há divergência a descartar silenciosamente.
    const extracao =
      existente ??
      ExtracaoOrcamento.criar(
        orcamentoId,
        ReferenciaClassificacao.de(params.referenciaClassificacao),
        ReferenciaS3.de(params.referenciaBrutaS3),
        params.tenantId,
      );

    const bruto = await this.leituraBruta.ler(extracao.referenciaBrutaS3);
    const nomeArquivo =
      extracao.referenciaBrutaS3.key.split('/').at(-1) ?? extracao.referenciaBrutaS3.key;
    let textoConvertido: string;
    try {
      textoConvertido = await this.conversor.converter(bruto, nomeArquivo);
    } catch (erro) {
      // (T045/#110, constituição — "Extração de documento prefere biblioteca
      // open-source a serviço pago") Gatilho da exceção documentada por escrito
      // que autorizaria serviço pago equivalente (ex.: Amazon Textract) — hoje
      // nenhum gateway de serviço pago existe neste BC (só MarkItDown, ADR-002),
      // então o proxy observável é esta falha de conversão, não o "uso" em si.
      emitirMetrica(this.logger, 'ConversaoMarkItDownFalhou', 1);
      this.logger.error({ erro }, 'Falha na conversão MarkItDown');
      throw erro;
    }
    const resultado = await this.agenteExtrator.extrair({
      textoConvertido,
      referenciaClassificacao: extracao.referenciaClassificacao,
    });

    extracao.registrarTentativaExtrator(resultado.itens, resultado.condicoesComerciais);
    emitirMetricaCamposNaoExtraidos(this.logger, resultado.itens, resultado.condicoesComerciais);
    await repositorio.salvar(extracao);

    // (issue #656 — aperto de tipo) O evento carrega o `tenantId` já
    // persistido no agregado (fonte da verdade, imutável desde a criação) —
    // sempre concreto desde `ExtracaoOrcamento.tenantId` deixar de ser
    // opcional (guard `ExtracaoSemTenantIdError` removido: tornou-se
    // inalcançável).
    const tenantId = extracao.tenantId;

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
