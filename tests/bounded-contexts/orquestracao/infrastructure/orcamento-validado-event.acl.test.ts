import { describe, expect, it } from 'vitest';
import { OrcamentoValidadoEventACLInvalidoError } from '../../../../src/bounded-contexts/orquestracao/domain/errors/evento-upstream-acl.errors.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';
import { OrcamentoValidadoEventACL } from '../../../../src/bounded-contexts/orquestracao/infrastructure/orcamento-validado-event.acl.js';

const ORCAMENTO_ID_VALIDO = '01912e2e-7f3a-7c3a-89ab-0123456789ab';

/** Payload real pós ADR-003 (spec 004, T006/PR #556) — schemaVersion 2, com itens/condicoesComerciais. */
const ITENS_ENRIQUECIDOS = [
  {
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
  },
];

describe('OrcamentoValidadoEventACL', () => {
  it('traduz OrcamentoValidado (schemaVersion 2) para ContextoValidacao "VALIDADO"', () => {
    const acl = new OrcamentoValidadoEventACL();

    const resultado = acl.traduzir({
      detailType: 'OrcamentoValidado',
      schemaVersion: 2,
      orcamentoId: ORCAMENTO_ID_VALIDO,
      ocorreuEm: new Date().toISOString(),
      itens: ITENS_ENRIQUECIDOS,
      condicoesComerciais: '30 dias, CIF',
    });

    expect(resultado.orcamentoId.equals(OrcamentoId.de(ORCAMENTO_ID_VALIDO))).toBe(true);
    expect(resultado.contextoValidacao.resultado).toBe('VALIDADO');
    expect(resultado.contextoValidacao.inconsistenciasAceitas).toEqual([]);
  });

  it('traduz OrcamentoValidadoComRessalva para ContextoValidacao "VALIDADO_COM_RESSALVA" com inconsistências aceitas', () => {
    const acl = new OrcamentoValidadoEventACL();

    const resultado = acl.traduzir({
      detailType: 'OrcamentoValidadoComRessalva',
      schemaVersion: 2,
      orcamentoId: ORCAMENTO_ID_VALIDO,
      ocorreuEm: new Date().toISOString(),
      inconsistencias: [
        { regra: 'PRECO_FORA_DA_FAIXA', detalhe: 'Preço unitário 20% acima da faixa esperada' },
      ],
      itens: ITENS_ENRIQUECIDOS,
      condicoesComerciais: '30 dias, CIF',
    });

    expect(resultado.contextoValidacao.resultado).toBe('VALIDADO_COM_RESSALVA');
    expect(resultado.contextoValidacao.inconsistenciasAceitas).toEqual([
      { regra: 'PRECO_FORA_DA_FAIXA', detalhe: 'Preço unitário 20% acima da faixa esperada' },
    ]);
  });

  it('ignora itens/condicoesComerciais do payload enriquecido — ContextoValidacao não os carrega', () => {
    const acl = new OrcamentoValidadoEventACL();

    const resultado = acl.traduzir({
      detailType: 'OrcamentoValidado',
      orcamentoId: ORCAMENTO_ID_VALIDO,
      itens: ITENS_ENRIQUECIDOS,
      condicoesComerciais: '30 dias, CIF',
    });

    expect(resultado.contextoValidacao).not.toHaveProperty('itens');
    expect(resultado.contextoValidacao).not.toHaveProperty('condicoesComerciais');
  });

  it.each([
    null,
    undefined,
    'texto',
    42,
    {},
    { orcamentoId: ORCAMENTO_ID_VALIDO },
    { orcamentoId: ORCAMENTO_ID_VALIDO, detailType: 'DetailTypeDesconhecido' },
    { orcamentoId: ORCAMENTO_ID_VALIDO, detailType: 'OrcamentoValidadoComRessalva' },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'OrcamentoValidadoComRessalva',
      inconsistencias: 'nao-eh-array',
    },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'OrcamentoValidadoComRessalva',
      inconsistencias: [{ regra: 'X' }],
    },
    { orcamentoId: 42, detailType: 'OrcamentoValidado' },
  ])('lança OrcamentoValidadoEventACLInvalidoError para payload malformado: %j', (bruto) => {
    expect(() => new OrcamentoValidadoEventACL().traduzir(bruto)).toThrow(
      OrcamentoValidadoEventACLInvalidoError,
    );
  });
});
