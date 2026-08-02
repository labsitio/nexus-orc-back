import { describe, expect, it } from 'vitest';
import { OrcamentoValidacao } from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import { CNPJ } from '../../../../src/bounded-contexts/validacao/domain/value-objects/cnpj.vo.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import { InconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import {
  validarCamposObrigatorios,
  validarCnpjValido,
  validarPrazoCoerente,
  validarPrecoDentroDaFaixa,
} from '../../../../src/bounded-contexts/validacao/domain/regras-consistencia.js';
import type { FaixaPreco } from '../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';
import type { FornecedorCadastradoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/fornecedor-cadastrado.gateway.js';
import type { ParametroFaixaPrecoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/parametro-faixa-preco.gateway.js';
import type {
  OrcamentoExtraidoEventACL,
  OrcamentoExtraidoEventACLResultado,
} from '../../../../src/bounded-contexts/validacao/domain/gateways/orcamento-extraido-event.acl.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/validacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/validacao/domain/events/domain-event.js';
import { OrcamentoValidado } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado.event.js';
import { OrcamentoInconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.js';

/**
 * T021 — Integration test: `OrcamentoExtraido` (documento de teste
 * consistente) publicado → `OrcamentoValidado` publicado, p95 medido em
 * ambiente de teste local (LocalStack).
 *
 * `ValidarOrcamento` (Application, T024/#134) e o handler Lambda consumidor
 * de `validador-queue` (Interface, T025) ainda não existem — são issues
 * downstream desta trilha, não implementadas nesta task. Este teste fixa,
 * como especificação executável, a orquestração que `ValidarOrcamento`
 * deverá seguir (traduz payload via ACL → checa CNPJ contra cadastro →
 * aplica as 4 regras determinísticas de consistência (T010) → registra no
 * agregado `OrcamentoValidacao` (T009) → publica evento correspondente),
 * mesmo padrão já aprovado em
 * `tests/bounded-contexts/extracao/application/extrair-dados-orcamento.integration.test.ts`
 * (T020/spec 002). Nenhum código de produção de T022/T023/T024 é
 * antecipado aqui.
 *
 * O plan.md classifica testes de integração contra LocalStack real
 * (SQS/EventBridge) como execução de CI/DevOps, não deste teste — aqui a
 * fila e o bus são substituídos pelos fakes de
 * `FornecedorCadastradoGateway`/`ParametroFaixaPrecoGateway`/`EventPublisher`,
 * e o p95 medido é o da orquestração em si (proxy local), não o do
 * pipeline AWS ponta a ponta (esse é T047, Polish, após IAM/Lambda reais
 * existirem).
 */

class FornecedorCadastradoGatewayFake implements FornecedorCadastradoGateway {
  constructor(private readonly cadastrado: boolean) {}

  async estaCadastrado(_cnpj: CNPJ): Promise<boolean> {
    return this.cadastrado;
  }
}

class ParametroFaixaPrecoGatewayFake implements ParametroFaixaPrecoGateway {
  constructor(private readonly faixas: readonly FaixaPreco[]) {}

  async listarTodas(): Promise<readonly FaixaPreco[]> {
    return this.faixas;
  }
}

class OrcamentoExtraidoEventACLFake implements OrcamentoExtraidoEventACL {
  constructor(private readonly resultadoSimulado: OrcamentoExtraidoEventACLResultado) {}

  traduzir(_payloadBruto: unknown): OrcamentoExtraidoEventACLResultado {
    return this.resultadoSimulado;
  }
}

class EventPublisherFake implements EventPublisher {
  readonly eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

const CNPJ_VALIDO = '11222333000181';

function novosDadosConsistentes(): DadosExtraidosParaValidacao {
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

/**
 * Orquestração equivalente à que `ValidarOrcamento` (T024) executará ao
 * consumir uma mensagem de `validador-queue`: traduz o payload bruto via
 * ACL, checa CNPJ contra o cadastro de fornecedores, aplica as 4 regras
 * determinísticas de consistência (T010) e registra o resultado no
 * agregado (T009) — nunca decide o evento fora da regra do agregado.
 */
async function processarMensagemValidadorQueue(
  payloadBruto: unknown,
  acl: OrcamentoExtraidoEventACL,
  fornecedorCadastrado: FornecedorCadastradoGateway,
  parametroFaixaPreco: ParametroFaixaPrecoGateway,
  publisher: EventPublisher,
): Promise<OrcamentoValidacao> {
  const { orcamentoId, dadosExtraidos } = acl.traduzir(payloadBruto);
  const validacao = OrcamentoValidacao.criar(orcamentoId, dadosExtraidos);

  const faixasPreco = await parametroFaixaPreco.listarTodas();
  const cnpj = CNPJ.de(dadosExtraidos.cnpjFornecedor);
  const cadastrado = await fornecedorCadastrado.estaCadastrado(cnpj);

  const inconsistencias: InconsistenciaDetectada[] = [
    ...validarCnpjValido(dadosExtraidos),
    ...validarCamposObrigatorios(dadosExtraidos),
    ...validarPrecoDentroDaFaixa(dadosExtraidos, faixasPreco),
    ...validarPrazoCoerente(dadosExtraidos),
    ...(cadastrado
      ? []
      : [
          InconsistenciaDetectada.de(
            'CNPJ_DIVERGENTE_CADASTRO',
            'CNPJ do fornecedor não corresponde a nenhum cadastro conhecido',
          ),
        ]),
  ];

  validacao.avaliarRegrasDeConsistencia(inconsistencias);

  const evento =
    validacao.status === 'VALIDADO'
      ? new OrcamentoValidado(validacao.orcamentoId.toString())
      : new OrcamentoInconsistenciaDetectada(
          validacao.orcamentoId.toString(),
          validacao.inconsistencias.map((inconsistencia) => inconsistencia.paraPayload()),
        );
  await publisher.publicar(evento);

  return validacao;
}

describe('Consumidor de validador-queue (integração simulada)', () => {
  it('publica OrcamentoValidado quando o documento é consistente (sem intervenção manual)', async () => {
    const orcamentoId = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');
    const acl = new OrcamentoExtraidoEventACLFake({
      orcamentoId,
      dadosExtraidos: novosDadosConsistentes(),
    });
    const publisher = new EventPublisherFake();

    const validacao = await processarMensagemValidadorQueue(
      { orcamentoId: orcamentoId.toString() },
      acl,
      new FornecedorCadastradoGatewayFake(true),
      new ParametroFaixaPrecoGatewayFake([]),
      publisher,
    );

    expect(validacao.status).toBe('VALIDADO');
    expect(publisher.eventosPublicados).toHaveLength(1);
    const evento = publisher.eventosPublicados[0] as OrcamentoValidado;
    expect(evento.detailType).toBe(OrcamentoValidado.detailType);
    expect(evento.schemaVersion).toBe(1);
    expect(evento.orcamentoId).toBe(orcamentoId.toString());
  });

  it('p95 da orquestração (20 execuções simuladas, ambiente de teste local) fica muito abaixo da meta de 5 minutos (spec.md)', async () => {
    const META_P95_MS = 5 * 60 * 1000;
    const duracoes: number[] = [];

    for (let i = 0; i < 20; i++) {
      const orcamentoId = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');
      const acl = new OrcamentoExtraidoEventACLFake({
        orcamentoId,
        dadosExtraidos: novosDadosConsistentes(),
      });
      const publisher = new EventPublisherFake();

      const inicio = performance.now();
      await processarMensagemValidadorQueue(
        { orcamentoId: orcamentoId.toString() },
        acl,
        new FornecedorCadastradoGatewayFake(true),
        new ParametroFaixaPrecoGatewayFake([]),
        publisher,
      );
      duracoes.push(performance.now() - inicio);
    }

    duracoes.sort((a, b) => a - b);
    const indiceP95 = Math.ceil(0.95 * duracoes.length) - 1;
    const p95 = duracoes[indiceP95]!;

    // ponytail: p95 aqui é da orquestração em memória (gateways fake), proxy
    // local exigido por T021 — medição real ponta a ponta (rede AWS,
    // Bedrock, cold start de Lambda) é T047 (Polish), após
    // FornecedorCadastradoHttpGateway (T022) e o handler Lambda (T025)
    // existirem.
    expect(p95).toBeLessThan(META_P95_MS);
  });
});
