import { describe, expect, it } from 'vitest';
import {
  ClassificarOrcamento,
  OrcamentoNaoEncontradoParaClassificacaoError,
  TenantDivergenciaError,
  derivarFormatoIdentificado,
} from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/classificar-orcamento.js';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import type { ArmazenamentoBrutoGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/armazenamento-bruto.gateway.js';
import type { MarkItDownConversaoACL } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/markitdown-conversao.acl.js';
import type {
  AgenteClassificadorGateway,
  ResultadoAgenteClassificador,
} from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/agente-classificador.gateway.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/event-publisher.js';
import type { CacheIdentificacaoGateway } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/gateways/cache-identificacao.gateway.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.js';
import { OrcamentoClassificado } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-classificado.event.js';
import { OrcamentoEscalonadoParaRevisaoHumana } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-escalonado-revisao-humana.event.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { ResultadoClassificacao } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

function novoOrcamentoRecebido(
  tenantId: TenantId = TenantId.novo(),
  key = 'portal-web/orcamento.pdf',
): Orcamento {
  return Orcamento.receber({
    id: OrcamentoId.novo(),
    canal: Canal.de('PORTAL_WEB'),
    referenciaBruta: ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key,
      versionId: 'v1',
    }),
    tenantId,
  });
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

class ArmazenamentoBrutoFake implements ArmazenamentoBrutoGateway {
  async armazenar(): Promise<ReferenciaS3> {
    throw new Error('não usado neste teste');
  }
  async lerConteudoBruto(): Promise<Uint8Array> {
    return new Uint8Array([1, 2, 3]);
  }
  async gerarUrlUpload(): Promise<string> {
    throw new Error('não usado neste teste');
  }
  async confirmarUpload(): Promise<ReferenciaS3 | undefined> {
    throw new Error('não usado neste teste');
  }
}

class ConversorFake implements MarkItDownConversaoACL {
  async converterParaTexto(): Promise<string> {
    return 'texto convertido';
  }
}

class AgenteClassificadorFake implements AgenteClassificadorGateway {
  constructor(private readonly resultado: ResultadoAgenteClassificador) {}
  async classificar(): Promise<ResultadoAgenteClassificador> {
    return this.resultado;
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];
  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

class CacheIdentificacaoGatewayFalhaFake implements CacheIdentificacaoGateway {
  async buscar(): Promise<never> {
    throw new Error('DynamoDB timeout');
  }
  async registrar(): Promise<void> {
    throw new Error('não usado neste teste');
  }
}

describe('ClassificarOrcamento', () => {
  it('busca bruto, converte, classifica e publica OrcamentoClassificado quando confiança >= 80', async () => {
    const orcamento = novoOrcamentoRecebido();
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'Acme Ltda',
        nivelConfianca: 90,
      }),
      publisher,
    );

    await useCase.executar(orcamento.id.toString(), orcamento.tenantId);

    expect(orcamento.status).toBe('CLASSIFICADO');
    expect(repositorio.salvos).toHaveLength(1);
    expect(publisher.eventosPublicados).toHaveLength(1);
    expect(publisher.eventosPublicados[0]?.detailType).toBe(OrcamentoClassificado.detailType);
  });

  it('publica OrcamentoEscalonadoParaRevisaoHumana quando confiança < 80', async () => {
    const orcamento = novoOrcamentoRecebido();
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'Acme Ltda',
        nivelConfianca: 40,
      }),
      publisher,
    );

    await useCase.executar(orcamento.id.toString(), orcamento.tenantId);

    expect(orcamento.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(publisher.eventosPublicados[0]?.detailType).toBe(
      OrcamentoEscalonadoParaRevisaoHumana.detailType,
    );
  });

  it('lança erro e nunca publica evento se o orçamento não existir', async () => {
    const repositorio = new RepositorioFake(undefined);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'X',
        nivelConfianca: 90,
      }),
      publisher,
    );

    await expect(useCase.executar(OrcamentoId.novo().toString(), TenantId.novo())).rejects.toThrow(
      OrcamentoNaoEncontradoParaClassificacaoError,
    );
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('nunca publica evento se o orçamento já não estiver em RECEBIDO (transição inválida do agregado)', async () => {
    const orcamento = novoOrcamentoRecebido();
    orcamento.registrarTentativaClassificador(
      ResultadoClassificacao.criar({
        fornecedorIdentificado: 'X',
        formatoIdentificado: 'PDF',
        nivelConfianca: NivelConfianca.de(90),
        agenteOrigem: 'CLASSIFICADOR',
      }),
    );
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'X',
        nivelConfianca: 90,
      }),
      publisher,
    );

    await expect(useCase.executar(orcamento.id.toString(), orcamento.tenantId)).rejects.toThrow();
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('T012: cache-miss por erro/timeout em CacheIdentificacaoGateway.buscar não bloqueia nem falha a classificação', async () => {
    const orcamento = novoOrcamentoRecebido();
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'Acme Ltda',
        nivelConfianca: 90,
      }),
      publisher,
      new CacheIdentificacaoGatewayFalhaFake(),
    );

    await useCase.executar(orcamento.id.toString(), orcamento.tenantId);

    expect(orcamento.status).toBe('CLASSIFICADO');
    expect(repositorio.salvos).toHaveLength(1);
    expect(publisher.eventosPublicados).toHaveLength(1);
    expect(publisher.eventosPublicados[0]?.detailType).toBe(OrcamentoClassificado.detailType);
  });

  it('(spec 007, T018) lança TenantDivergenciaError (DIVERGENTE) e nunca constrói o repositório quando tenantId não é informado', async () => {
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => {
        throw new Error('nunca deveria construir o repositório sem tenantId');
      },
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'X',
        nivelConfianca: 90,
      }),
      publisher,
    );

    const erro = await useCase
      .executar(OrcamentoId.novo().toString(), undefined)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(TenantDivergenciaError);
    expect((erro as TenantDivergenciaError).motivo).toBe('DIVERGENTE');
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('(spec 007, T017) lança TenantDivergenciaError (AUSENTE) quando o agregado não tem tenantId (legado pré-retrofit)', async () => {
    const orcamentoLegado = Orcamento.receber({
      id: OrcamentoId.novo(),
      canal: Canal.de('PORTAL_WEB'),
      referenciaBruta: ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'portal-web/orcamento.pdf',
        versionId: 'v1',
      }),
    });
    const repositorio = new RepositorioFake(orcamentoLegado);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'X',
        nivelConfianca: 90,
      }),
      publisher,
    );

    const erro = await useCase
      .executar(orcamentoLegado.id.toString(), TenantId.novo())
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(TenantDivergenciaError);
    expect((erro as TenantDivergenciaError).motivo).toBe('AUSENTE');
    expect(publisher.eventosPublicados).toHaveLength(0);
    expect(repositorio.salvos).toHaveLength(0);
  });

  it('(spec 007, T017) lança TenantDivergenciaError (DIVERGENTE) quando o tenantId da requisição diverge do agregado', async () => {
    const orcamento = novoOrcamentoRecebido(TenantId.novo());
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'X',
        nivelConfianca: 90,
      }),
      publisher,
    );

    const erro = await useCase
      .executar(orcamento.id.toString(), TenantId.novo())
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(TenantDivergenciaError);
    expect((erro as TenantDivergenciaError).motivo).toBe('DIVERGENTE');
    expect(publisher.eventosPublicados).toHaveLength(0);
    expect(repositorio.salvos).toHaveLength(0);
  });

  it('(ADR-012, #725) deriva formatoIdentificado da extensão do arquivo, nunca do agente — mesmo que o gateway não devolva o campo', async () => {
    const orcamento = novoOrcamentoRecebido(
      TenantId.novo(),
      'sftp-incoming/018f4b1a-0000-7000-8000-000000000000-orcamento.txt',
    );
    const repositorio = new RepositorioFake(orcamento);
    const publisher = new EventPublisherFake();
    const useCase = new ClassificarOrcamento(
      () => repositorio,
      new ArmazenamentoBrutoFake(),
      new ConversorFake(),
      new AgenteClassificadorFake({
        fornecedorIdentificado: 'Acme Ltda',
        nivelConfianca: 90,
      }),
      publisher,
    );

    await useCase.executar(orcamento.id.toString(), orcamento.tenantId);

    const evento = publisher.eventosPublicados[0] as OrcamentoClassificado;
    expect(evento.resultado.formatoIdentificado).toBe('TXT');
  });
});

describe('derivarFormatoIdentificado', () => {
  it('deriva a extensão em maiúsculas a partir do nome no formato real <uuid>-nome.ext', () => {
    expect(derivarFormatoIdentificado('018f4b1a-0000-7000-8000-000000000000-orcamento.pdf')).toBe(
      'PDF',
    );
    expect(derivarFormatoIdentificado('018f4b1a-0000-7000-8000-000000000000-nota.txt')).toBe('TXT');
  });

  it('cai em DESCONHECIDO quando o nome não tem extensão', () => {
    expect(derivarFormatoIdentificado('018f4b1a-0000-7000-8000-000000000000-orcamento')).toBe(
      'DESCONHECIDO',
    );
  });

  it('cai em DESCONHECIDO quando o "." é o último caractere (sem extensão real)', () => {
    expect(derivarFormatoIdentificado('arquivo.')).toBe('DESCONHECIDO');
  });

  it('cai em DESCONHECIDO para extensão atípica (não alfanumérica ou absurdamente longa)', () => {
    expect(derivarFormatoIdentificado('arquivo.tar.gz')).toBe('GZ');
    expect(derivarFormatoIdentificado('arquivo.exe; rm -rf')).toBe('DESCONHECIDO');
    expect(derivarFormatoIdentificado(`arquivo.${'a'.repeat(20)}`)).toBe('DESCONHECIDO');
  });
});
