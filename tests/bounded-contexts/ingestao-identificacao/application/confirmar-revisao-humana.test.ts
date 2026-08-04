import { describe, expect, it } from 'vitest';
import {
  ConfirmarRevisaoHumana,
  OrcamentoNaoEncontradoParaRevisaoHumanaError,
} from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/confirmar-revisao-humana.js';
import {
  Orcamento,
  TransicaoInvalidaError,
} from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { ResultadoClassificacao } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.js';
import { OrcamentoReclassificadoPorRevisaoHumana } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-reclassificado-revisao-humana.event.js';

function novoOrcamentoEscalonado(tenantId: TenantId = TenantId.novo()): Orcamento {
  const orcamento = Orcamento.receber({
    id: OrcamentoId.novo(),
    canal: Canal.de('PORTAL_WEB'),
    referenciaBruta: ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'portal-web/orcamento.pdf',
      versionId: 'v1',
    }),
    tenantId,
  });
  orcamento.registrarTentativaClassificador(
    ResultadoClassificacao.criar({
      fornecedorIdentificado: 'Fornecedor Incerto',
      formatoIdentificado: 'XLSX',
      nivelConfianca: NivelConfianca.de(40),
      agenteOrigem: 'CLASSIFICADOR',
    }),
  );
  return orcamento;
}

class RepositorioFake implements OrcamentoRepository {
  constructor(private orcamento: Orcamento | undefined) {}
  salvos: Orcamento[] = [];
  async buscarPorId(): Promise<Orcamento | undefined> {
    return this.orcamento;
  }
  async salvar(orcamento: Orcamento): Promise<void> {
    this.salvos.push(orcamento);
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

describe('ConfirmarRevisaoHumana', () => {
  it('confirma orçamento em PENDENTE_REVISAO_HUMANA, persiste e publica OrcamentoReclassificadoPorRevisaoHumana', async () => {
    const orcamento = novoOrcamentoEscalonado();
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ConfirmarRevisaoHumana(repositorio, publisher);

    const resultado = await useCase.executar({
      orcamentoId: orcamento.id.toString(),
      fornecedorIdentificado: 'Distribuidora ABC Ltda',
      formatoIdentificado: 'PDF_TABELA_PADRAO',
      tenantId: orcamento.tenantId!,
    });

    expect(resultado.status).toBe('CLASSIFICADO');
    expect(resultado.resultadoAtual?.agenteOrigem).toBe('HUMANO');
    expect(resultado.resultadoAtual?.nivelConfianca.valor).toBe(100);
    expect(repositorio.salvos).toHaveLength(1);
    expect(publisher.eventosPublicados).toHaveLength(1);
    expect(publisher.eventosPublicados[0]?.detailType).toBe(
      OrcamentoReclassificadoPorRevisaoHumana.detailType,
    );
  });

  it('preserva o histórico do Classificador — nunca apaga, apenas anexa a confirmação humana', async () => {
    const orcamento = novoOrcamentoEscalonado();
    const repositorio = new RepositorioFake(orcamento);
    const useCase = new ConfirmarRevisaoHumana(repositorio, new EventPublisherFake());

    const resultado = await useCase.executar({
      orcamentoId: orcamento.id.toString(),
      fornecedorIdentificado: 'Distribuidora ABC Ltda',
      formatoIdentificado: 'PDF_TABELA_PADRAO',
      tenantId: orcamento.tenantId!,
    });

    expect(resultado.historico).toHaveLength(2);
    expect(resultado.historico[0]?.agente).toBe('CLASSIFICADOR');
    expect(resultado.historico[1]?.agente).toBe('HUMANO');
  });

  it('lança OrcamentoNaoEncontradoParaRevisaoHumanaError e nunca publica evento se o orçamento não existir', async () => {
    const repositorio = new RepositorioFake(undefined);
    const publisher = new EventPublisherFake();
    const useCase = new ConfirmarRevisaoHumana(repositorio, publisher);
    const tenantId = TenantId.novo();

    await expect(
      useCase.executar({
        orcamentoId: OrcamentoId.novo().toString(),
        fornecedorIdentificado: 'X',
        formatoIdentificado: 'PDF',
        tenantId,
      }),
    ).rejects.toThrow(OrcamentoNaoEncontradoParaRevisaoHumanaError);
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('lança TransicaoInvalidaError (409 no controller) e nunca publica evento se o status não for PENDENTE_REVISAO_HUMANA', async () => {
    const tenantId = TenantId.novo();
    const orcamento = Orcamento.receber({
      id: OrcamentoId.novo(),
      canal: Canal.de('PORTAL_WEB'),
      referenciaBruta: ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'portal-web/orcamento.pdf',
        versionId: 'v1',
      }),
      tenantId,
    });
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ConfirmarRevisaoHumana(repositorio, publisher);

    await expect(
      useCase.executar({
        orcamentoId: orcamento.id.toString(),
        fornecedorIdentificado: 'X',
        formatoIdentificado: 'PDF',
        tenantId,
      }),
    ).rejects.toThrow(TransicaoInvalidaError);
    expect(publisher.eventosPublicados).toHaveLength(0);
    expect(repositorio.salvos).toHaveLength(0);
  });
});
