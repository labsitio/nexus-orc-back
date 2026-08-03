import { describe, expect, it } from 'vitest';
import { ValidarOrcamento } from '../../../../src/bounded-contexts/validacao/application/use-cases/validar-orcamento.js';
import { OrcamentoValidacao } from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import { CNPJ } from '../../../../src/bounded-contexts/validacao/domain/value-objects/cnpj.vo.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import type { FaixaPreco } from '../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';
import type { FornecedorCadastradoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/fornecedor-cadastrado.gateway.js';
import type { ParametroFaixaPrecoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/parametro-faixa-preco.gateway.js';
import type {
  OrcamentoExtraidoEventACL,
  OrcamentoExtraidoEventACLResultado,
} from '../../../../src/bounded-contexts/validacao/domain/gateways/orcamento-extraido-event.acl.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/validacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/validacao/domain/events/domain-event.js';
import type { OrcamentoValidacaoRepository } from '../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { OrcamentoValidado } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado.event.js';
import { OrcamentoInconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.js';

/**
 * T024 (#134) — Application: `ValidarOrcamento`. Unit test com mocks de
 * gateway/repositório (Vitest, sem rede), conforme `plan.md` ("Testing").
 * Orquestração espelha a especificação executável fixada em T021
 * (`validar-orcamento.integration.test.ts`), agora exercitando a classe de
 * produção diretamente.
 */

class ACLFake implements OrcamentoExtraidoEventACL {
  constructor(private readonly resultado: OrcamentoExtraidoEventACLResultado) {}

  traduzir(): OrcamentoExtraidoEventACLResultado {
    return this.resultado;
  }
}

class FornecedorCadastradoGatewayFake implements FornecedorCadastradoGateway {
  chamadas = 0;
  constructor(private readonly cadastrado: boolean) {}

  async estaCadastrado(_cnpj: CNPJ): Promise<boolean> {
    this.chamadas++;
    return this.cadastrado;
  }
}

class ParametroFaixaPrecoGatewayFake implements ParametroFaixaPrecoGateway {
  constructor(private readonly faixas: readonly FaixaPreco[] = []) {}

  async listarTodas(): Promise<readonly FaixaPreco[]> {
    return this.faixas;
  }
}

class OrcamentoValidacaoRepositoryFake implements OrcamentoValidacaoRepository {
  salvos: OrcamentoValidacao[] = [];
  constructor(private existente: OrcamentoValidacao | undefined = undefined) {}

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    this.salvos.push(orcamentoValidacao);
    this.existente = orcamentoValidacao;
  }

  async buscarPorOrcamentoId(): Promise<OrcamentoValidacao | undefined> {
    return this.existente;
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

const CNPJ_VALIDO = '11222333000181';
const ORCAMENTO_ID = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');

function dadosConsistentes(): DadosExtraidosParaValidacao {
  return DadosExtraidosParaValidacao.de({
    cnpjFornecedor: CNPJ_VALIDO,
    itens: [
      ItemParaValidacao.de({
        descricao: 'Caixa de papelão ondulado 40x30x20',
        quantidade: 500,
        precoUnitario: Dinheiro.de(320, 'BRL'),
        extraido: true,
      }),
    ],
    condicoesComerciais: '30/60/90 dias',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
  });
}

function dadosComCnpjInvalido(): DadosExtraidosParaValidacao {
  return DadosExtraidosParaValidacao.de({
    ...dadosConsistentes(),
    cnpjFornecedor: '11111111111111',
  });
}

describe('ValidarOrcamento', () => {
  it('publica OrcamentoValidado quando todas as regras passam e o CNPJ está cadastrado', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const publisher = new EventPublisherFake();
    const fornecedorCadastrado = new FornecedorCadastradoGatewayFake(true);
    const useCase = new ValidarOrcamento(
      new ACLFake({ orcamentoId: ORCAMENTO_ID, dadosExtraidos: dadosConsistentes() }),
      repositorio,
      fornecedorCadastrado,
      new ParametroFaixaPrecoGatewayFake(),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(repositorio.salvos).toHaveLength(1);
    expect(repositorio.salvos[0]!.status).toBe('VALIDADO');
    expect(fornecedorCadastrado.chamadas).toBe(1);
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as OrcamentoValidado;
    expect(evento.detailType).toBe(OrcamentoValidado.detailType);
    expect(evento.orcamentoId).toBe(ORCAMENTO_ID.toString());
  });

  it('publica OrcamentoInconsistenciaDetectada com CNPJ_DIVERGENTE_CADASTRO quando o CNPJ não está cadastrado', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const publisher = new EventPublisherFake();
    const useCase = new ValidarOrcamento(
      new ACLFake({ orcamentoId: ORCAMENTO_ID, dadosExtraidos: dadosConsistentes() }),
      repositorio,
      new FornecedorCadastradoGatewayFake(false),
      new ParametroFaixaPrecoGatewayFake(),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(repositorio.salvos[0]!.status).toBe('PENDENTE_REVISAO_HUMANA');
    const evento = publisher.eventosPublicados[0] as OrcamentoInconsistenciaDetectada;
    expect(evento.detailType).toBe(OrcamentoInconsistenciaDetectada.detailType);
    expect(evento.inconsistencias.map((i) => i.regra)).toContain('CNPJ_DIVERGENTE_CADASTRO');
  });

  it('nunca consulta o cadastro externo quando o CNPJ já é inválido em formato/dígito verificador', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const publisher = new EventPublisherFake();
    const fornecedorCadastrado = new FornecedorCadastradoGatewayFake(true);
    const useCase = new ValidarOrcamento(
      new ACLFake({ orcamentoId: ORCAMENTO_ID, dadosExtraidos: dadosComCnpjInvalido() }),
      repositorio,
      fornecedorCadastrado,
      new ParametroFaixaPrecoGatewayFake(),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(fornecedorCadastrado.chamadas).toBe(0);
    expect(repositorio.salvos[0]!.status).toBe('PENDENTE_REVISAO_HUMANA');
    const evento = publisher.eventosPublicados[0] as OrcamentoInconsistenciaDetectada;
    expect(evento.inconsistencias.map((i) => i.regra)).toContain('CNPJ_INVALIDO');
    expect(evento.inconsistencias.map((i) => i.regra)).not.toContain('CNPJ_DIVERGENTE_CADASTRO');
  });

  it('é idempotente: nunca reavalia nem republica quando o orçamento já saiu de PENDENTE (entrega duplicada da fila)', async () => {
    const jaValidado = OrcamentoValidacao.criar(ORCAMENTO_ID, dadosConsistentes());
    jaValidado.avaliarRegrasDeConsistencia([]);
    const repositorio = new OrcamentoValidacaoRepositoryFake(jaValidado);
    const publisher = new EventPublisherFake();
    const fornecedorCadastrado = new FornecedorCadastradoGatewayFake(true);
    const useCase = new ValidarOrcamento(
      new ACLFake({ orcamentoId: ORCAMENTO_ID, dadosExtraidos: dadosConsistentes() }),
      repositorio,
      fornecedorCadastrado,
      new ParametroFaixaPrecoGatewayFake(),
      publisher,
    );

    await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

    expect(repositorio.salvos).toHaveLength(0);
    expect(fornecedorCadastrado.chamadas).toBe(0);
    expect(publisher.eventosPublicados).toHaveLength(0);
  });
});
