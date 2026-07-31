import { describe, expect, it } from 'vitest';
import {
  BedrockExtracaoACL,
  BedrockExtracaoACLInvalidaError,
  ehExtracaoBruta,
  type ExtracaoBruta,
} from '../../../../src/bounded-contexts/extracao/infrastructure/bedrock-extracao.acl.js';

function extracaoBrutaCompleta(): ExtracaoBruta {
  return {
    itens: [
      {
        descricao: { valor: { descricao: 'Parafuso M6' }, confianca: 95 },
        quantidade: { valor: 500, confianca: 90 },
        precoUnitario: { valor: { valorCentavos: 320, moeda: 'BRL' }, confianca: 88 },
      },
    ],
    condicoesComerciais: {
      condicoesPagamento: { valor: '30/60/90 dias', confianca: 85 },
      prazoValidade: { valor: '2026-08-30', confianca: 90 },
      condicoesEntrega: { valor: 'CIF', confianca: 92 },
    },
  };
}

describe('BedrockExtracaoACL', () => {
  it('converte campo com confiança >= 80 e valor presente em CampoExtraido extraído', () => {
    const acl = new BedrockExtracaoACL();
    const resultado = acl.converter(extracaoBrutaCompleta());

    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0]?.completo()).toBe(true);
    expect(resultado.itens[0]?.descricao.extraido).toBe(true);
    expect(resultado.itens[0]?.descricao.valor?.descricao).toBe('Parafuso M6');
    expect(resultado.itens[0]?.quantidade.valor?.valor).toBe(500);
    expect(resultado.itens[0]?.precoUnitario.valor?.valorCentavos).toBe(320);
    expect(resultado.condicoesComerciais.completo()).toBe(true);
  });

  it('nunca inventa valor: confiança < 80 vira CampoExtraido não extraído mesmo com valor não nulo reportado', () => {
    const bruto = extracaoBrutaCompleta();
    const comBaixaConfianca: ExtracaoBruta = {
      ...bruto,
      itens: [
        {
          ...bruto.itens[0]!,
          precoUnitario: { valor: { valorCentavos: 999, moeda: 'BRL' }, confianca: 40 },
        },
      ],
    };

    const resultado = new BedrockExtracaoACL().converter(comBaixaConfianca);

    expect(resultado.itens[0]?.precoUnitario.extraido).toBe(false);
    expect(resultado.itens[0]?.precoUnitario.valor).toBeNull();
    expect(resultado.itens[0]?.completo()).toBe(false);
  });

  it('nunca inventa valor: modelo reporta valor null (confiança alta ou não) vira CampoExtraido não extraído', () => {
    const bruto = extracaoBrutaCompleta();
    const semValor: ExtracaoBruta = {
      ...bruto,
      itens: [{ ...bruto.itens[0]!, quantidade: { valor: null, confianca: 97 } }],
    };

    const resultado = new BedrockExtracaoACL().converter(semValor);

    expect(resultado.itens[0]?.quantidade.extraido).toBe(false);
    expect(resultado.itens[0]?.quantidade.valor).toBeNull();
  });

  it('lança erro se itens vier vazio (nunca aceita extração sem nenhum item)', () => {
    const bruto = extracaoBrutaCompleta();
    expect(() => new BedrockExtracaoACL().converter({ ...bruto, itens: [] })).toThrow(
      BedrockExtracaoACLInvalidaError,
    );
  });

  it('lança erro de domínio se confiança reportada estiver fora de 0–100 (nunca confia cegamente no LLM)', () => {
    const bruto = extracaoBrutaCompleta();
    const confiancaInvalida: ExtracaoBruta = {
      ...bruto,
      itens: [{ ...bruto.itens[0]!, quantidade: { valor: 10, confianca: 150 } }],
    };

    expect(() => new BedrockExtracaoACL().converter(confiancaInvalida)).toThrow();
  });

  it('ehExtracaoBruta rejeita shape sem itens/condicoesComerciais', () => {
    expect(ehExtracaoBruta({ itens: [] })).toBe(false);
    expect(ehExtracaoBruta(null)).toBe(false);
    expect(ehExtracaoBruta('texto livre')).toBe(false);
    expect(ehExtracaoBruta(extracaoBrutaCompleta())).toBe(true);
  });
});
