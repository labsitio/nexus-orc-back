import { describe, expect, it } from 'vitest';
import {
  BedrockExtracaoACL,
  BedrockExtracaoACLInvalidaError,
  ehExtracaoBruta,
  resolverPrazoValidade,
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

  it('rejeita com BedrockExtracaoACLInvalidaError (nunca TypeError) o payload real devolvido pelo llama3.1 — descricao.valor string em vez de objeto', () => {
    const brutoRealLlama = {
      itens: [
        {
          descricao: { valor: 'Chapa de aco carbono 2mm', confianca: 100 },
          quantidade: { valor: 10, confianca: 100 },
          precoUnitario: { valor: { valorCentavos: 45000, moeda: 'R$' }, confianca: 100 },
        },
      ],
      condicoesComerciais: {
        condicoesPagamento: { valor: '30 dias', confianca: 100 },
        prazoValidade: { valor: '30 dias', confianca: 100 },
        condicoesEntrega: { valor: 'CIF', confianca: 100 },
      },
    } as unknown as ExtracaoBruta;

    expect(ehExtracaoBruta(brutoRealLlama)).toBe(false);
    expect(() => new BedrockExtracaoACL().converter(brutoRealLlama)).toThrow(
      BedrockExtracaoACLInvalidaError,
    );
  });

  it('ehExtracaoBruta aceita valor: null em qualquer CampoBruto (contrato de "não extraído")', () => {
    const bruto = extracaoBrutaCompleta();
    const comValorNulo: ExtracaoBruta = {
      ...bruto,
      itens: [{ ...bruto.itens[0]!, quantidade: { valor: null, confianca: 97 } }],
    };

    expect(ehExtracaoBruta(comValorNulo)).toBe(true);
  });

  it('normaliza moeda "R$" para "BRL" ao converter precoUnitario', () => {
    const bruto = extracaoBrutaCompleta();
    const comMoedaBrasileira: ExtracaoBruta = {
      ...bruto,
      itens: [
        {
          ...bruto.itens[0]!,
          precoUnitario: { valor: { valorCentavos: 45000, moeda: 'R$' }, confianca: 100 },
        },
      ],
    };

    const resultado = new BedrockExtracaoACL().converter(comMoedaBrasileira);

    expect(resultado.itens[0]?.precoUnitario.valor?.moeda).toBe('BRL');
  });

  it('resolve extração bem-sucedida (não PeriodoValidadeInvalidoError) para o payload real que quebrava — prazoValidade "30 dias"', () => {
    const bruto = extracaoBrutaCompleta();
    const comPeriodoRelativo: ExtracaoBruta = {
      ...bruto,
      condicoesComerciais: {
        ...bruto.condicoesComerciais,
        prazoValidade: { valor: '30 dias', confianca: 100 },
      },
    };

    const resultado = new BedrockExtracaoACL().converter(comPeriodoRelativo);

    expect(resultado.condicoesComerciais.prazoValidade.extraido).toBe(true);
    expect(resultado.condicoesComerciais.prazoValidade.valor).not.toBeNull();
  });

  it('degrada prazoValidade não reconhecido para naoExtraido (residual), sem lançar erro', () => {
    const bruto = extracaoBrutaCompleta();
    const comTextoResidual: ExtracaoBruta = {
      ...bruto,
      condicoesComerciais: {
        ...bruto.condicoesComerciais,
        prazoValidade: { valor: 'válido enquanto durar o estoque', confianca: 95 },
      },
    };

    const resultado = new BedrockExtracaoACL().converter(comTextoResidual);

    expect(resultado.condicoesComerciais.prazoValidade.extraido).toBe(false);
    expect(resultado.condicoesComerciais.prazoValidade.valor).toBeNull();
  });
});

describe('resolverPrazoValidade (ADR-015)', () => {
  const referencia = (iso: string) => new Date(iso);

  it.each([
    ['2026-09-10', undefined, '2026-09-10'],
    ['10/09/2026', undefined, '2026-09-10'],
    ['30 dias', '2026-08-05', '2026-09-04'],
    ['prazo de 15 dias corridos', '2026-08-05', '2026-08-20'],
    ['2 semanas', '2026-08-05', '2026-08-19'],
    ['1 mês', '2026-01-31', '2026-03-01'],
    ['1 mês', '2026-01-30', '2026-03-01'],
    ['3 meses', '2026-11-30', '2027-03-01'],
    ['3 meses', '2026-08-15', '2026-11-15'],
    ['1 ano', '2026-08-05', '2027-08-05'],
  ] as const)('"%s" com referência %s resolve para %s', (texto, ref, esperado) => {
    const resultado = resolverPrazoValidade(
      texto,
      ref === undefined ? new Date() : referencia(ref),
    );

    expect(resultado).toBeDefined();
    expect(resultado!.paraPayload().slice(0, 10)).toBe(esperado);
  });

  it.each(['válido enquanto durar o estoque', 'validade indeterminada'])(
    '"%s" não casa nenhum caminho — undefined (residual)',
    (texto) => {
      expect(resolverPrazoValidade(texto, new Date())).toBeUndefined();
    },
  );

  it('rejeita data ISO de calendário inexistente ("2026-02-30") em vez de fazer overflow silencioso para 02/03', () => {
    // `new Date('2026-02-30')` não lança nem devolve Invalid Date — o
    // runtime faz overflow silencioso. Round-trip contra os componentes
    // parseados tem que rejeitar isso e cair no residual.
    expect(resolverPrazoValidade('2026-02-30', new Date())).toBeUndefined();
  });

  it('ARMADILHA: "10/09/2026" nunca resolve para 9 de outubro (new Date cru interpretaria mês/dia)', () => {
    const resultado = resolverPrazoValidade('10/09/2026', new Date());

    expect(resultado!.paraPayload().slice(0, 10)).toBe('2026-09-10');
    expect(resultado!.paraPayload().slice(0, 10)).not.toBe('2026-10-09');
  });
});

describe('BedrockExtracaoACL — moeda', () => {
  it('rejeita moeda desconhecida (sem normalização enumerada) como BedrockExtracaoACLInvalidaError', () => {
    const bruto = extracaoBrutaCompleta();
    const comMoedaDesconhecida: ExtracaoBruta = {
      ...bruto,
      itens: [
        {
          ...bruto.itens[0]!,
          precoUnitario: { valor: { valorCentavos: 45000, moeda: 'XYZ$' }, confianca: 100 },
        },
      ],
    };

    expect(() => new BedrockExtracaoACL().converter(comMoedaDesconhecida)).toThrow();
  });
});
