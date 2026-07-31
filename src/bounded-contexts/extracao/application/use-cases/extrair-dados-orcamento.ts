import type { AgenteExtratorGateway } from '../../domain/gateways/agente-extrator.gateway.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type { LeituraBrutaGateway } from '../../domain/gateways/leitura-bruta.gateway.js';
import type { MarkItDownConversaoExtracaoACL } from '../../domain/gateways/markitdown-conversao-extracao.acl.js';
import { ExtracaoEscalonadaParaRevisaoHumana } from '../../domain/events/extracao-escalonada-revisao-humana.event.js';
import { OrcamentoExtraido } from '../../domain/events/orcamento-extraido.event.js';
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
}

/** Motivo registrado em `ExtracaoEscalonadaParaRevisaoHumana` (plan.md/ADR-003). */
const MOTIVO_CAMPO_SEM_CONFIANCA = '1+ campo obrigatório sem confiança suficiente';

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

    const extracao =
      existente ??
      ExtracaoOrcamento.criar(
        orcamentoId,
        ReferenciaClassificacao.de(params.referenciaClassificacao),
        ReferenciaS3.de(params.referenciaBrutaS3),
      );

    const bruto = await this.leituraBruta.ler(extracao.referenciaBrutaS3);
    const textoConvertido = await this.conversor.converter(bruto);
    const resultado = await this.agenteExtrator.extrair({
      textoConvertido,
      referenciaClassificacao: extracao.referenciaClassificacao,
    });

    extracao.registrarTentativaExtrator(resultado.itens, resultado.condicoesComerciais);
    await this.repositorio.salvar(extracao);

    const evento =
      extracao.status === 'EXTRAIDO'
        ? new OrcamentoExtraido(
            extracao.orcamentoId.toString(),
            extracao.itens.map((item) => item.paraPayload()),
            extracao.condicoesComerciais!.paraPayload(),
          )
        : new ExtracaoEscalonadaParaRevisaoHumana(
            extracao.orcamentoId.toString(),
            MOTIVO_CAMPO_SEM_CONFIANCA,
          );
    await this.eventPublisher.publicar(evento);
  }
}
