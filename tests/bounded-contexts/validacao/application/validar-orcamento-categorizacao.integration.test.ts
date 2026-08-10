import { describe, expect, it } from 'vitest';
import { ValidarOrcamento } from '../../../../src/bounded-contexts/validacao/application/use-cases/validar-orcamento.js';
import { CategoriaItem } from '../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { CNPJ } from '../../../../src/bounded-contexts/validacao/domain/value-objects/cnpj.vo.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { FaixaPreco } from '../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import type {
  AgenteCategorizadorItemGateway,
  AgenteCategorizadorItemInput,
} from '../../../../src/bounded-contexts/validacao/domain/gateways/agente-categorizador-item.gateway.js';
import type { FornecedorCadastradoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/fornecedor-cadastrado.gateway.js';
import type { ParametroFaixaPrecoGateway } from '../../../../src/bounded-contexts/validacao/domain/gateways/parametro-faixa-preco.gateway.js';
import type {
  OrcamentoExtraidoEventACL,
  OrcamentoExtraidoEventACLResultado,
} from '../../../../src/bounded-contexts/validacao/domain/gateways/orcamento-extraido-event.acl.js';
import type { EventPublisher } from '../../../../src/bounded-contexts/validacao/domain/gateways/event-publisher.js';
import type { DomainEventEnvelope } from '../../../../src/bounded-contexts/validacao/domain/events/domain-event.js';
import type { OrcamentoValidacaoRepository } from '../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { OrcamentoValidacao } from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import { OrcamentoValidado } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-validado.event.js';
import { OrcamentoInconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/events/orcamento-inconsistencia-detectada.event.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * T040 (#150) — Integration test: item com descrição livre →
 * `AgenteCategorizadorItemGateway` retorna categoria do catálogo → regra de
 * preço (`validarPrecoDentroDaFaixa`, T010) compara contra a `FaixaPreco`
 * correta → resultado determinístico (dentro/fora de faixa) independente da
 * IA (ADR-002: a IA só seleciona a categoria, nunca decide sozinha se o
 * preço está correto).
 *
 * Exercita `ValidarOrcamento` (T024/T042) ponta a ponta com gateways fake —
 * mesmo padrão de `validar-orcamento.test.ts` — mas com duas implementações
 * de `AgenteCategorizadorItemGateway` que representam "IAs" distintas
 * (latência e ordem de resolução diferentes). Ambas devolvem a mesma
 * categoria do catálogo configurado; o teste prova que o resultado da regra
 * de preço (dentro/fora de faixa) é o mesmo nos dois casos — a
 * determinística é da regra de preço, não da IA.
 */

class ACLFake implements OrcamentoExtraidoEventACL {
  constructor(private readonly resultado: OrcamentoExtraidoEventACLResultado) {}

  traduzir(): OrcamentoExtraidoEventACLResultado {
    return this.resultado;
  }
}

class FornecedorCadastradoGatewayFake implements FornecedorCadastradoGateway {
  async estaCadastrado(_cnpj: CNPJ): Promise<boolean> {
    return true;
  }
}

class ParametroFaixaPrecoGatewayFake implements ParametroFaixaPrecoGateway {
  constructor(private readonly faixas: readonly FaixaPreco[]) {}

  async listarTodas(): Promise<readonly FaixaPreco[]> {
    return this.faixas;
  }

  async upsert(): Promise<void> {
    throw new Error('não usado por ValidarOrcamento — apenas leitura');
  }
}

class OrcamentoValidacaoRepositoryFake implements OrcamentoValidacaoRepository {
  salvos: OrcamentoValidacao[] = [];

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    this.salvos.push(orcamentoValidacao);
  }

  async buscarPorOrcamentoId(): Promise<OrcamentoValidacao | undefined> {
    return undefined;
  }
}

class EventPublisherFake implements EventPublisher {
  eventosPublicados: DomainEventEnvelope[] = [];

  async publicar(evento: DomainEventEnvelope): Promise<void> {
    this.eventosPublicados.push(evento);
  }
}

/**
 * "IA rápida" — resolve a categoria imediatamente. Simula um gateway como
 * `BedrockCategorizadorItemGateway` com latência mínima.
 */
class AgenteCategorizadorRapidoFake implements AgenteCategorizadorItemGateway {
  constructor(private readonly categoria: CategoriaItem) {}

  async categorizar(_input: AgenteCategorizadorItemInput): Promise<CategoriaItem> {
    return this.categoria;
  }
}

/**
 * "IA lenta" — resolve a mesma categoria após um microtask adicional,
 * simulando uma implementação de IA distinta com latência maior (ex.:
 * outro modelo Bedrock ou o gateway Ollama local, ADR-009). A regra de
 * preço nunca deve depender de qual das duas respondeu.
 */
class AgenteCategorizadorLentoFake implements AgenteCategorizadorItemGateway {
  constructor(private readonly categoria: CategoriaItem) {}

  async categorizar(_input: AgenteCategorizadorItemInput): Promise<CategoriaItem> {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    return this.categoria;
  }
}

const CNPJ_VALIDO = '11222333000181';
const ORCAMENTO_ID = OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057');
const TENANT_ID = TenantId.novo();

const FAIXA_EMBALAGENS = FaixaPreco.de(
  CategoriaItem.de('embalagens'),
  Dinheiro.de(100, 'BRL'),
  Dinheiro.de(500, 'BRL'),
);
const FAIXA_LIMPEZA = FaixaPreco.de(
  CategoriaItem.de('material de limpeza'),
  Dinheiro.de(10, 'BRL'),
  Dinheiro.de(50, 'BRL'),
);
const CATALOGO = [FAIXA_EMBALAGENS, FAIXA_LIMPEZA];

function dadosComItemDescricaoLivre(precoUnitario: Dinheiro): DadosExtraidosParaValidacao {
  return DadosExtraidosParaValidacao.de({
    cnpjFornecedor: CNPJ_VALIDO,
    itens: [
      ItemParaValidacao.de({
        descricao: 'Caixa de papelão ondulado reforçada 40x30x20cm',
        quantidade: 500,
        precoUnitario,
        extraido: true,
        // sem `categoria` — item de descrição livre, categorização é
        // responsabilidade do AgenteCategorizadorItemGateway (T042).
      }),
    ],
    condicoesComerciais: '30/60/90 dias',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
  });
}

async function executarComGateway(
  agenteCategorizador: AgenteCategorizadorItemGateway,
  precoUnitario: Dinheiro,
): Promise<{ repositorio: OrcamentoValidacaoRepositoryFake; publisher: EventPublisherFake }> {
  const repositorio = new OrcamentoValidacaoRepositoryFake();
  const publisher = new EventPublisherFake();
  const useCase = new ValidarOrcamento(
    new ACLFake({
      orcamentoId: ORCAMENTO_ID,
      dadosExtraidos: dadosComItemDescricaoLivre(precoUnitario),
      tenantId: TENANT_ID,
    }),
    () => repositorio,
    new FornecedorCadastradoGatewayFake(),
    new ParametroFaixaPrecoGatewayFake(CATALOGO),
    publisher,
    agenteCategorizador,
  );

  await useCase.executar({ orcamentoId: ORCAMENTO_ID.toString() });

  return { repositorio, publisher };
}

describe('ValidarOrcamento — categorização de item + regra de preço por categoria (T040)', () => {
  it.each([
    ['IA rápida', () => new AgenteCategorizadorRapidoFake(CategoriaItem.de('embalagens'))],
    ['IA lenta', () => new AgenteCategorizadorLentoFake(CategoriaItem.de('embalagens'))],
  ])(
    '%s: preço dentro da faixa da categoria "embalagens" → OrcamentoValidado, independente da IA',
    async (_nome, criarGateway) => {
      const { repositorio, publisher } = await executarComGateway(
        criarGateway(),
        Dinheiro.de(320, 'BRL'), // dentro de [100, 500] — faixa de "embalagens"
      );

      expect(repositorio.salvos[0]!.status).toBe('VALIDADO');
      expect(publisher.eventosPublicados).toHaveLength(1);
      expect(publisher.eventosPublicados[0]!.detailType).toBe(OrcamentoValidado.detailType);
    },
  );

  it.each([
    ['IA rápida', () => new AgenteCategorizadorRapidoFake(CategoriaItem.de('embalagens'))],
    ['IA lenta', () => new AgenteCategorizadorLentoFake(CategoriaItem.de('embalagens'))],
  ])(
    '%s: preço fora da faixa da categoria "embalagens" → PRECO_FORA_DE_FAIXA, independente da IA',
    async (_nome, criarGateway) => {
      const { repositorio, publisher } = await executarComGateway(
        criarGateway(),
        Dinheiro.de(9999, 'BRL'), // fora de [100, 500]
      );

      expect(repositorio.salvos[0]!.status).toBe('PENDENTE_REVISAO_HUMANA');
      const evento = publisher.eventosPublicados[0] as OrcamentoInconsistenciaDetectada;
      expect(evento.detailType).toBe(OrcamentoInconsistenciaDetectada.detailType);
      expect(evento.inconsistencias.map((i) => i.regra)).toContain('PRECO_FORA_DE_FAIXA');
    },
  );

  it('compara contra a FaixaPreco da categoria retornada pela IA, nunca contra outra categoria do catálogo', async () => {
    // A IA categoriza como "embalagens" (faixa [100, 500]); o preço está
    // fora da faixa de "embalagens" mas dentro da faixa de "material de
    // limpeza" ([10, 50]) — a regra MUST comparar contra a faixa da
    // categoria correta, nunca aceitar por coincidir com outra faixa do
    // catálogo.
    const { repositorio, publisher } = await executarComGateway(
      new AgenteCategorizadorRapidoFake(CategoriaItem.de('embalagens')),
      Dinheiro.de(30, 'BRL'),
    );

    expect(repositorio.salvos[0]!.status).toBe('PENDENTE_REVISAO_HUMANA');
    const evento = publisher.eventosPublicados[0] as OrcamentoInconsistenciaDetectada;
    expect(evento.inconsistencias.map((i) => i.regra)).toContain('PRECO_FORA_DE_FAIXA');
  });
});
