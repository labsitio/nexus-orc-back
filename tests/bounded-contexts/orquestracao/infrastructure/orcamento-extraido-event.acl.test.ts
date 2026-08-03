import { describe, expect, it } from 'vitest';
import { OrcamentoExtraidoEventACLInvalidoError } from '../../../../src/bounded-contexts/orquestracao/domain/errors/evento-upstream-acl.errors.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';
import { OrcamentoExtraidoEventACL } from '../../../../src/bounded-contexts/orquestracao/infrastructure/orcamento-extraido-event.acl.js';

const ORCAMENTO_ID_VALIDO = '01912e2e-7f3a-7c3a-89ab-0123456789ab';

const ITEM_COMPLETO = {
  descricao: {
    valor: { descricao: 'Parafuso M6' },
    confianca: 95,
    extraido: true,
    agenteOrigem: 'EXTRATOR',
  },
  quantidade: { valor: 100, confianca: 95, extraido: true, agenteOrigem: 'EXTRATOR' },
  precoUnitario: {
    valor: { valorCentavos: 250, moeda: 'BRL' },
    confianca: 95,
    extraido: true,
    agenteOrigem: 'EXTRATOR',
  },
};

const CONDICOES_COMERCIAIS_COMPLETAS = {
  condicoesPagamento: { valor: '30 dias', confianca: 90, extraido: true, agenteOrigem: 'EXTRATOR' },
  prazoValidade: { valor: '15 dias', confianca: 90, extraido: true, agenteOrigem: 'EXTRATOR' },
  condicoesEntrega: { valor: 'CIF', confianca: 90, extraido: true, agenteOrigem: 'EXTRATOR' },
};

describe('OrcamentoExtraidoEventACL', () => {
  it('traduz OrcamentoExtraido para ContextoExtracao com houvePendenciaConfirmada: false', () => {
    const acl = new OrcamentoExtraidoEventACL();

    const resultado = acl.traduzir({
      detailType: 'OrcamentoExtraido',
      schemaVersion: 1,
      orcamentoId: ORCAMENTO_ID_VALIDO,
      ocorreuEm: new Date().toISOString(),
      itens: [ITEM_COMPLETO],
      condicoesComerciais: CONDICOES_COMERCIAIS_COMPLETAS,
    });

    expect(resultado.orcamentoId.equals(OrcamentoId.de(ORCAMENTO_ID_VALIDO))).toBe(true);
    expect(resultado.contextoExtracao.houvePendenciaConfirmada).toBe(false);
    expect(resultado.contextoExtracao.itensResumo).toContain('Parafuso M6');
    expect(resultado.contextoExtracao.itensResumo).toContain('100');
    expect(resultado.contextoExtracao.itensResumo).toContain('2.50 BRL');
    expect(resultado.contextoExtracao.condicoesComerciaisResumo).toContain('30 dias');
    expect(resultado.contextoExtracao.condicoesComerciaisResumo).toContain('CIF');
  });

  it('traduz OrcamentoExtraidoComPendenciaConfirmada com houvePendenciaConfirmada: true', () => {
    const acl = new OrcamentoExtraidoEventACL();

    const resultado = acl.traduzir({
      detailType: 'OrcamentoExtraidoComPendenciaConfirmada',
      orcamentoId: ORCAMENTO_ID_VALIDO,
      itens: [ITEM_COMPLETO],
      condicoesComerciais: CONDICOES_COMERCIAIS_COMPLETAS,
    });

    expect(resultado.contextoExtracao.houvePendenciaConfirmada).toBe(true);
  });

  it('formata campo não extraído (valor: null) como "não informado" no resumo', () => {
    const acl = new OrcamentoExtraidoEventACL();

    const resultado = acl.traduzir({
      detailType: 'OrcamentoExtraidoComPendenciaConfirmada',
      orcamentoId: ORCAMENTO_ID_VALIDO,
      itens: [
        {
          descricao: {
            valor: { descricao: 'Parafuso M6' },
            confianca: 95,
            extraido: true,
            agenteOrigem: 'EXTRATOR',
          },
          quantidade: { valor: null, confianca: 0, extraido: false, agenteOrigem: 'EXTRATOR' },
          precoUnitario: {
            valor: { valorCentavos: 250, moeda: 'BRL' },
            confianca: 95,
            extraido: true,
            agenteOrigem: 'EXTRATOR',
          },
        },
      ],
      condicoesComerciais: {
        ...CONDICOES_COMERCIAIS_COMPLETAS,
        prazoValidade: { valor: null, confianca: 0, extraido: false, agenteOrigem: 'EXTRATOR' },
      },
    });

    expect(resultado.contextoExtracao.itensResumo).toContain('não informado');
    expect(resultado.contextoExtracao.condicoesComerciaisResumo).toContain('não informado');
  });

  it.each([
    null,
    undefined,
    'texto',
    42,
    {},
    { orcamentoId: ORCAMENTO_ID_VALIDO },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'DetailTypeDesconhecido',
      itens: [],
      condicoesComerciais: {},
    },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'OrcamentoExtraido',
      itens: 'nao-eh-array',
      condicoesComerciais: CONDICOES_COMERCIAIS_COMPLETAS,
    },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'OrcamentoExtraido',
      itens: [{}],
      condicoesComerciais: CONDICOES_COMERCIAIS_COMPLETAS,
    },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'OrcamentoExtraido',
      itens: [ITEM_COMPLETO],
      condicoesComerciais: {},
    },
  ])('lança OrcamentoExtraidoEventACLInvalidoError para payload malformado: %j', (bruto) => {
    expect(() => new OrcamentoExtraidoEventACL().traduzir(bruto)).toThrow(
      OrcamentoExtraidoEventACLInvalidoError,
    );
  });
});
