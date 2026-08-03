import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type { AgenteEmbeddingGateway } from '../../domain/gateways/agente-embedding.gateway.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type {
  OrcamentoValidadoEventACL,
  OrcamentoValidadoEventDetailType,
} from '../../domain/gateways/orcamento-validado-event.acl.js';
import type { IndiceOrcamentoRepository } from '../../domain/repositories/indice-orcamento.repository.js';
import { IndiceOrcamento } from '../../domain/aggregates/indice-orcamento.aggregate.js';
import { FalhaIndexacaoDetectada } from '../../domain/events/falha-indexacao-detectada.event.js';
import { OrcamentoIndexado } from '../../domain/events/orcamento-indexado.event.js';

export class IndexarOrcamentoInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`IndexarOrcamento inválido: ${mensagem}`);
  }
}

/**
 * Caso de uso acionado pelo consumidor SQS de `indexador-queue` (T030, ainda
 * não implementado) a cada mensagem `OrcamentoValidado`/
 * `OrcamentoValidadoComRessalva` roteada pelo EventBridge (plan.md).
 *
 * `tenantId` vem do próprio envelope do evento upstream (nunca inferido por
 * este BC — convenção #3 da spec 007, ADR-005), por isso é parâmetro
 * dedicado de `executar` e nunca extraído de `payloadBruto` (que é tratado
 * como entrada não confiável e só atravessa o `OrcamentoValidadoEventACL`).
 *
 * Idempotência de retry: `buscarPorOrcamentoId` recupera o agregado já
 * persistido (se existir) antes de decidir criar um novo — assim uma
 * redelivery do SQS ou uma retentativa a partir de `FALHA_INDEXACAO` sempre
 * anexa ao mesmo histórico via `IndiceOrcamentoRepository.upsert`
 * (upsert idempotente por `orcamentoId`), nunca duplicando o agregado.
 * `conteudoIndexavel`/`origemValidacao` do agregado recuperado nunca são
 * sobrescritos (imutáveis fora do construtor de criação, ADR-004) — apenas o
 * payload traduzido da primeira vez é preservado.
 *
 * Falha técnica do `AgenteEmbeddingGateway` nunca propaga daqui: é capturada,
 * registrada via `registrarTentativaIndexacao({ resultado: 'FALHA_TECNICA' })`
 * — persistida (histórico append-only) — e publicada como
 * `FalhaIndexacaoDetectada`, para que o consumidor SQS (T030) possa seguir
 * processando as demais mensagens do lote sem que uma falha isolada
 * interrompa o batch (Princípio IV — exceção sempre visível, nunca
 * silenciosa, mas também nunca bloqueante das demais). Falha de
 * infraestrutura (ex.: `IndiceOrcamentoRepository.upsert`,
 * `EventPublisher.publicar`) não é capturada aqui — propaga para o
 * consumidor decidir (retry via `maxReceiveCount` + DLQ, ADR-002).
 */
export class IndexarOrcamento {
  constructor(
    private readonly acl: OrcamentoValidadoEventACL,
    private readonly embeddingGateway: AgenteEmbeddingGateway,
    private readonly repositorio: IndiceOrcamentoRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(
    tenantId: TenantId,
    detailType: OrcamentoValidadoEventDetailType,
    payloadBruto: unknown,
  ): Promise<void> {
    if (!tenantId) {
      throw new IndexarOrcamentoInvalidoError('tenantId é obrigatório');
    }

    const traduzido = this.acl.traduzir(detailType, payloadBruto);

    const existente = await this.repositorio.buscarPorOrcamentoId(traduzido.orcamentoId);
    const indice =
      existente ??
      IndiceOrcamento.criar({
        orcamentoId: traduzido.orcamentoId,
        tenantId,
        conteudoIndexavel: traduzido.conteudoIndexavel,
        origemValidacao: traduzido.origemValidacao,
      });

    try {
      const embedding = await this.embeddingGateway.gerarEmbedding(
        indice.conteudoIndexavel.paraTexto(),
      );
      indice.registrarTentativaIndexacao({
        resultado: 'INDEXADO',
        timestamp: new Date(),
        embedding,
      });
      await this.repositorio.upsert(indice);
      await this.eventPublisher.publicar(
        new OrcamentoIndexado(
          traduzido.orcamentoId.toString(),
          tenantId.toString(),
          embedding.modeloId,
        ),
      );
      return;
    } catch (erro) {
      const motivoFalha = erro instanceof Error ? erro.message : String(erro);
      indice.registrarTentativaIndexacao({
        resultado: 'FALHA_TECNICA',
        timestamp: new Date(),
        motivoFalha,
      });
      await this.repositorio.upsert(indice);
      await this.eventPublisher.publicar(
        new FalhaIndexacaoDetectada(
          traduzido.orcamentoId.toString(),
          tenantId.toString(),
          motivoFalha,
          indice.historico.length,
        ),
      );
    }
  }
}
