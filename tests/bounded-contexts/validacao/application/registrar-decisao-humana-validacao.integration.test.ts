import { describe, expect, it } from 'vitest';
import { ValidarOrcamento } from '../../../../src/bounded-contexts/validacao/application/use-cases/validar-orcamento.js';
import {
  ConsultarStatusValidacao,
  OrcamentoValidacaoNaoEncontradoError,
} from '../../../../src/bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import { OrcamentoValidacao } from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import { CNPJ } from '../../../../src/bounded-contexts/validacao/domain/value-objects/cnpj.vo.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import type { FaixaPreco } from '../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';
import type { CategoriaItem } from '../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import type { FornecedorCadastradoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/fornecedor-cadastrado.gateway.js';
import type { ParametroFaixaPrecoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/parametro-faixa-preco.gateway.js';
import type {
  AgenteCategorizadorItemGateway,
  AgenteCategorizadorItemInput,
} from '../../../../src/bounded-contexts/validacao/domain/gateways/agente-categorizador-item.gateway.js';
import type {
  OrcamentoExtraidoEventACL,
  OrcamentoExtraidoEventACLResultado,
} from '../../../../src/bounded-contexts/validacao/domain/gateways/orcamento-extraido-event.acl.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/validacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/validacao/domain/events/domain-event.js';
import type { OrcamentoValidacaoRepository } from '../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { OrcamentoValidado } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado.event.js';
import { OrcamentoInconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.js';
import { OrcamentoValidadoComRessalva } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado-com-ressalva.event.js';
import {
  validarCamposObrigatorios,
  validarCnpjValido,
  validarPrazoCoerente,
  validarPrecoDentroDaFaixa,
} from '../../../../src/bounded-contexts/validacao/domain/regras-consistencia.js';
import type { InconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * T033 (#143, spec 003) — Integration test: `OrcamentoExtraido` com
 * inconsistência conhecida → `OrcamentoInconsistenciaDetectada` publicado →
 * decisão humana via API → `OrcamentoValidado` ou
 * `OrcamentoValidadoComRessalva` publicado; status reflete
 * `PENDENTE_REVISAO_HUMANA` durante a espera, sem bloquear o processamento
 * de outros orçamentos (critério de aceite spec.md).
 *
 * `ValidarOrcamento` (T024/#134) e `ConsultarStatusValidacao` (T026/#136) já
 * existem em produção e são exercitados diretamente aqui. `RegistrarDecisaoHumanaValidacao`
 * (T035) e o controller `POST .../decisao-humana` (T036) ainda não existem —
 * mesma fronteira já documentada em `decisao-humana.contract.test.ts` (T032):
 * a orquestração da decisão humana abaixo (`processarDecisaoHumana`) espelha,
 * como especificação executável, o que T035 deverá fazer (busca o agregado,
 * recalcula as 4 regras determinísticas (T010) sobre os dados corrigidos
 * quando aplicável, aplica `OrcamentoValidacao.registrarDecisaoHumana` (T009/T030)
 * e publica o evento correspondente) — nenhum código de produção de T035/T036
 * é antecipado aqui.
 */

class ACLFake implements OrcamentoExtraidoEventACL {
  constructor(private readonly resultado: OrcamentoExtraidoEventACLResultado) {}

  traduzir(): OrcamentoExtraidoEventACLResultado {
    return this.resultado;
  }
}

class FornecedorCadastradoGatewayFake implements FornecedorCadastradoGateway {
  constructor(private readonly cadastrado: boolean = true) {}

  async estaCadastrado(_cnpj: CNPJ): Promise<boolean> {
    return this.cadastrado;
  }
}

class ParametroFaixaPrecoGatewayFake implements ParametroFaixaPrecoGateway {
  constructor(private readonly faixas: readonly FaixaPreco[] = []) {}

  async listarTodas(): Promise<readonly FaixaPreco[]> {
    return this.faixas;
  }
}

/** Persistência em memória por `orcamentoId` — várias entradas, ao contrário
 * do fake de valor único usado em `validar-orcamento.test.ts`, para provar
 * que orçamentos distintos são independentes entre si. */
class OrcamentoValidacaoRepositoryEmMemoria implements OrcamentoValidacaoRepository {
  private readonly porId = new Map<string, OrcamentoValidacao>();

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    this.porId.set(orcamentoValidacao.orcamentoId.toString(), orcamentoValidacao);
  }

  async buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<OrcamentoValidacao | undefined> {
    return this.porId.get(orcamentoId.toString());
  }
}

/**
 * Nesta suíte nenhum cenário configura faixa de preço (catálogo vazio) —
 * `ValidarOrcamento` nunca invoca o agente categorizador nesse caso (T042:
 * sem catálogo não há o que categorizar). Rejeita se for chamado por engano.
 */
class AgenteCategorizadorItemGatewayFake implements AgenteCategorizadorItemGateway {
  async categorizar(_input: AgenteCategorizadorItemInput): Promise<CategoriaItem> {
    throw new Error('AgenteCategorizadorItemGatewayFake: chamada inesperada neste teste');
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

type DecisaoHumanaInput =
  | { readonly tipo: 'CORRECAO_APLICADA'; readonly dadosCorrigidos: DadosExtraidosParaValidacao }
  | { readonly tipo: 'ACEITE_COM_RESSALVA' };

/**
 * Orquestração equivalente à que `RegistrarDecisaoHumanaValidacao` (T035)
 * executará ao receber `POST .../decisao-humana`: busca o agregado (404 se
 * inexistente — `OrcamentoValidacaoNaoEncontradoError`, mapeado pelo
 * controller T036), recalcula as regras sobre os dados corrigidos quando a
 * decisão é `CORRECAO_APLICADA`, aplica `registrarDecisaoHumana` (que por si
 * só rejeita qualquer status diferente de `PENDENTE_REVISAO_HUMANA` com
 * `TransicaoInvalidaValidacaoError` — mapeada pelo controller para 409,
 * T032/T036) e publica o evento terminal correspondente.
 */
async function processarDecisaoHumana(
  orcamentoId: OrcamentoId,
  decisao: DecisaoHumanaInput,
  repositorio: OrcamentoValidacaoRepository,
  parametroFaixaPreco: ParametroFaixaPrecoGateway,
  publisher: EventPublisher,
): Promise<OrcamentoValidacao> {
  const validacao = await repositorio.buscarPorOrcamentoId(orcamentoId);
  if (!validacao) {
    throw new OrcamentoValidacaoNaoEncontradoError(orcamentoId.toString());
  }

  if (decisao.tipo === 'CORRECAO_APLICADA') {
    const faixasPreco = await parametroFaixaPreco.listarTodas();
    const inconsistencias: InconsistenciaDetectada[] = [
      ...validarCnpjValido(decisao.dadosCorrigidos),
      ...validarCamposObrigatorios(decisao.dadosCorrigidos),
      ...validarPrecoDentroDaFaixa(decisao.dadosCorrigidos, faixasPreco),
      ...validarPrazoCoerente(decisao.dadosCorrigidos),
    ];
    validacao.registrarDecisaoHumana({ tipo: 'CORRECAO_APLICADA', inconsistencias });
  } else {
    validacao.registrarDecisaoHumana({ tipo: 'ACEITE_COM_RESSALVA' });
  }

  await repositorio.salvar(validacao);

  const tenantId = validacao.tenantId.toString();
  if (validacao.status === 'VALIDADO') {
    await publisher.publicar(
      new OrcamentoValidado(
        validacao.orcamentoId.toString(),
        validacao.dadosExtraidos.itens.map((item) => item.paraPayload()),
        validacao.dadosExtraidos.condicoesComerciais,
        tenantId,
      ),
    );
  } else if (validacao.status === 'VALIDADO_COM_RESSALVA') {
    await publisher.publicar(
      new OrcamentoValidadoComRessalva(
        validacao.orcamentoId.toString(),
        validacao.inconsistencias.map((i) => i.paraPayload()),
        validacao.dadosExtraidos.itens.map((item) => item.paraPayload()),
        validacao.dadosExtraidos.condicoesComerciais,
        tenantId,
      ),
    );
  }
  // Ainda `PENDENTE_REVISAO_HUMANA` (correção não resolveu tudo): nenhum
  // evento é publicado — nunca autoaprova (ADR-001), nova tentativa aguarda
  // nova decisão humana.

  return validacao;
}

const CNPJ_VALIDO = '11222333000181';

function dadosConsistentes(cnpjFornecedor = CNPJ_VALIDO): DadosExtraidosParaValidacao {
  return DadosExtraidosParaValidacao.de({
    cnpjFornecedor,
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

describe('Fluxo completo de resolução humana de inconsistência (T033)', () => {
  it('inconsistência conhecida (CNPJ inválido) → PENDENTE_REVISAO_HUMANA visível na consulta de status → CORRECAO_APLICADA sem inconsistência remanescente → OrcamentoValidado publicado', async () => {
    const orcamentoId = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');
    const tenantId = TenantId.novo();
    const repositorio = new OrcamentoValidacaoRepositoryEmMemoria();
    const publisher = new EventPublisherFake();
    const parametroFaixaPreco = new ParametroFaixaPrecoGatewayFake();

    const validarOrcamento = new ValidarOrcamento(
      new ACLFake({
        orcamentoId,
        dadosExtraidos: dadosConsistentes('11111111111111'),
        tenantId,
      }),
      () => repositorio,
      new FornecedorCadastradoGatewayFake(true),
      parametroFaixaPreco,
      publisher,
      new AgenteCategorizadorItemGatewayFake(),
    );
    await validarOrcamento.executar({ orcamentoId: orcamentoId.toString() });

    // (a) OrcamentoInconsistenciaDetectada publicado com a regra específica.
    expect(publisher.eventosPublicados).toHaveLength(1);
    const eventoInconsistencia = publisher.eventosPublicados[0] as OrcamentoInconsistenciaDetectada;
    expect(eventoInconsistencia.detailType).toBe(OrcamentoInconsistenciaDetectada.detailType);
    expect(eventoInconsistencia.inconsistencias.map((i) => i.regra)).toContain('CNPJ_INVALIDO');

    // (b) nunca "validado" silencioso; status de consulta reflete a espera.
    const consultarStatus = new ConsultarStatusValidacao(() => repositorio);
    const statusDurantePendencia = await consultarStatus.executar(orcamentoId.toString(), tenantId);
    expect(statusDurantePendencia.status).toBe('PENDENTE_REVISAO_HUMANA');

    // (c) decisão humana explícita (correção do CNPJ) → único caminho para validado.
    const validacaoFinal = await processarDecisaoHumana(
      orcamentoId,
      { tipo: 'CORRECAO_APLICADA', dadosCorrigidos: dadosConsistentes(CNPJ_VALIDO) },
      repositorio,
      parametroFaixaPreco,
      publisher,
    );

    expect(validacaoFinal.status).toBe('VALIDADO');
    expect(publisher.eventosPublicados).toHaveLength(2);
    const eventoValidado = publisher.eventosPublicados[1] as OrcamentoValidado;
    expect(eventoValidado.detailType).toBe(OrcamentoValidado.detailType);
    expect(eventoValidado.orcamentoId).toBe(orcamentoId.toString());

    const statusFinal = await consultarStatus.executar(orcamentoId.toString(), tenantId);
    expect(statusFinal.status).toBe('VALIDADO');
  });

  it('inconsistência conhecida → decisão humana ACEITE_COM_RESSALVA → OrcamentoValidadoComRessalva publicado, status VALIDADO_COM_RESSALVA (terminal)', async () => {
    const orcamentoId = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8058');
    const tenantId = TenantId.novo();
    const repositorio = new OrcamentoValidacaoRepositoryEmMemoria();
    const publisher = new EventPublisherFake();
    const parametroFaixaPreco = new ParametroFaixaPrecoGatewayFake();

    const validarOrcamento = new ValidarOrcamento(
      new ACLFake({
        orcamentoId,
        dadosExtraidos: dadosConsistentes('11111111111111'),
        tenantId,
      }),
      () => repositorio,
      new FornecedorCadastradoGatewayFake(true),
      parametroFaixaPreco,
      publisher,
      new AgenteCategorizadorItemGatewayFake(),
    );
    await validarOrcamento.executar({ orcamentoId: orcamentoId.toString() });

    const validacaoFinal = await processarDecisaoHumana(
      orcamentoId,
      { tipo: 'ACEITE_COM_RESSALVA' },
      repositorio,
      parametroFaixaPreco,
      publisher,
    );

    expect(validacaoFinal.status).toBe('VALIDADO_COM_RESSALVA');
    const eventoComRessalva = publisher.eventosPublicados[1] as OrcamentoValidadoComRessalva;
    expect(eventoComRessalva.detailType).toBe(OrcamentoValidadoComRessalva.detailType);
    expect(eventoComRessalva.inconsistencias.map((i) => i.regra)).toContain('CNPJ_INVALIDO');

    const consultarStatus = new ConsultarStatusValidacao(() => repositorio);
    const statusFinal = await consultarStatus.executar(orcamentoId.toString(), tenantId);
    expect(statusFinal.status).toBe('VALIDADO_COM_RESSALVA');
  });

  it('correção humana que ainda deixa inconsistência remanescente permanece PENDENTE_REVISAO_HUMANA e não publica evento terminal (nunca autoaprova)', async () => {
    const orcamentoId = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8059');
    const tenantId = TenantId.novo();
    const repositorio = new OrcamentoValidacaoRepositoryEmMemoria();
    const publisher = new EventPublisherFake();
    const parametroFaixaPreco = new ParametroFaixaPrecoGatewayFake();

    const validarOrcamento = new ValidarOrcamento(
      new ACLFake({
        orcamentoId,
        dadosExtraidos: dadosConsistentes('11111111111111'),
        tenantId,
      }),
      () => repositorio,
      new FornecedorCadastradoGatewayFake(true),
      parametroFaixaPreco,
      publisher,
      new AgenteCategorizadorItemGatewayFake(),
    );
    await validarOrcamento.executar({ orcamentoId: orcamentoId.toString() });
    expect(publisher.eventosPublicados).toHaveLength(1);

    // "Correção" que continua com CNPJ inválido — não resolve a inconsistência.
    const validacaoFinal = await processarDecisaoHumana(
      orcamentoId,
      { tipo: 'CORRECAO_APLICADA', dadosCorrigidos: dadosConsistentes('22222222222222') },
      repositorio,
      parametroFaixaPreco,
      publisher,
    );

    expect(validacaoFinal.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(publisher.eventosPublicados).toHaveLength(1); // nenhum evento novo.

    const consultarStatus = new ConsultarStatusValidacao(() => repositorio);
    const statusFinal = await consultarStatus.executar(orcamentoId.toString(), tenantId);
    expect(statusFinal.status).toBe('PENDENTE_REVISAO_HUMANA');
  });

  it('decisão humana antes de existir avaliação (orçamento inexistente) é rejeitada, mesma condição mapeada para 404 pelo controller (T036)', async () => {
    const orcamentoId = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a805a');
    const repositorio = new OrcamentoValidacaoRepositoryEmMemoria();
    const publisher = new EventPublisherFake();
    const parametroFaixaPreco = new ParametroFaixaPrecoGatewayFake();

    await expect(
      processarDecisaoHumana(
        orcamentoId,
        { tipo: 'ACEITE_COM_RESSALVA' },
        repositorio,
        parametroFaixaPreco,
        publisher,
      ),
    ).rejects.toBeInstanceOf(OrcamentoValidacaoNaoEncontradoError);
    expect(publisher.eventosPublicados).toHaveLength(0);
  });

  it('orçamento com inconsistência (PENDENTE_REVISAO_HUMANA) nunca bloqueia o processamento de um segundo orçamento consistente', async () => {
    const orcamentoPendente = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a805b');
    const orcamentoConsistente = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a805c');
    const tenantId = TenantId.novo();
    const repositorio = new OrcamentoValidacaoRepositoryEmMemoria();
    const publisher = new EventPublisherFake();
    const parametroFaixaPreco = new ParametroFaixaPrecoGatewayFake();

    const validarPendente = new ValidarOrcamento(
      new ACLFake({
        orcamentoId: orcamentoPendente,
        dadosExtraidos: dadosConsistentes('11111111111111'),
        tenantId,
      }),
      () => repositorio,
      new FornecedorCadastradoGatewayFake(true),
      parametroFaixaPreco,
      publisher,
      new AgenteCategorizadorItemGatewayFake(),
    );
    await validarPendente.executar({ orcamentoId: orcamentoPendente.toString() });

    const validarConsistente = new ValidarOrcamento(
      new ACLFake({
        orcamentoId: orcamentoConsistente,
        dadosExtraidos: dadosConsistentes(CNPJ_VALIDO),
        tenantId,
      }),
      () => repositorio,
      new FornecedorCadastradoGatewayFake(true),
      parametroFaixaPreco,
      publisher,
      new AgenteCategorizadorItemGatewayFake(),
    );
    await validarConsistente.executar({ orcamentoId: orcamentoConsistente.toString() });

    const consultarStatus = new ConsultarStatusValidacao(() => repositorio);
    expect((await consultarStatus.executar(orcamentoPendente.toString(), tenantId)).status).toBe(
      'PENDENTE_REVISAO_HUMANA',
    );
    expect((await consultarStatus.executar(orcamentoConsistente.toString(), tenantId)).status).toBe(
      'VALIDADO',
    );
  });
});
