import { describe, expect, it } from 'vitest';
import {
  BedrockInterpretacaoConsultaACL,
  BedrockInterpretacaoConsultaACLInvalidaError,
  ehInterpretacaoConsultaBruta,
} from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/bedrock-interpretacao-consulta.acl.js';

const CATALOGO_CATEGORIAS = ['ferragens', 'eletrica', 'hidraulica'] as const;

describe('ehInterpretacaoConsultaBruta', () => {
  it('aceita shape com textoLivreResidual string', () => {
    expect(ehInterpretacaoConsultaBruta({ textoLivreResidual: 'parafuso' })).toBe(true);
  });

  it('rejeita ausência de textoLivreResidual, null, ou tipo incorreto', () => {
    expect(ehInterpretacaoConsultaBruta({})).toBe(false);
    expect(ehInterpretacaoConsultaBruta(null)).toBe(false);
    expect(ehInterpretacaoConsultaBruta({ textoLivreResidual: 123 })).toBe(false);
  });
});

describe('BedrockInterpretacaoConsultaACL', () => {
  it('converte saída estruturada com categoria pertencente ao catálogo em CriterioBusca válido', () => {
    const acl = new BedrockInterpretacaoConsultaACL();

    const resultado = acl.converter(
      {
        categoria: 'ferragens',
        precoMinimo: { valorCentavos: 1000, moeda: 'BRL' },
        precoMaximo: { valorCentavos: 5000, moeda: 'BRL' },
        periodoRecebimento: { inicio: '2026-01-01T00:00:00.000Z', fim: '2026-01-31T00:00:00.000Z' },
        textoLivreResidual: 'parafuso sextavado',
      },
      CATALOGO_CATEGORIAS,
    );

    expect(resultado.categoria).toBe('ferragens');
    expect(resultado.precoMinimo?.valorCentavos).toBe(1000);
    expect(resultado.precoMaximo?.valorCentavos).toBe(5000);
    expect(resultado.periodoRecebimento?.inicio).toBeInstanceOf(Date);
    expect(resultado.textoLivreResidual).toBe('parafuso sextavado');
  });

  it('converte saída sem nenhum filtro estruturado (apenas texto livre) em CriterioBusca válido', () => {
    const acl = new BedrockInterpretacaoConsultaACL();

    const resultado = acl.converter(
      { textoLivreResidual: 'orçamentos recentes' },
      CATALOGO_CATEGORIAS,
    );

    expect(resultado.categoria).toBeUndefined();
    expect(resultado.precoMinimo).toBeUndefined();
    expect(resultado.precoMaximo).toBeUndefined();
    expect(resultado.periodoRecebimento).toBeUndefined();
    expect(resultado.textoLivreResidual).toBe('orçamentos recentes');
  });

  it('lança BedrockInterpretacaoConsultaACLInvalidaError quando categoria não pertence ao catálogo configurado', () => {
    const acl = new BedrockInterpretacaoConsultaACL();

    expect(() =>
      acl.converter(
        { categoria: 'categoria-inventada-pelo-modelo', textoLivreResidual: '' },
        CATALOGO_CATEGORIAS,
      ),
    ).toThrow(BedrockInterpretacaoConsultaACLInvalidaError);
  });

  it('nunca aceita categoria fora do catálogo mesmo com grafia parecida a uma categoria válida', () => {
    const acl = new BedrockInterpretacaoConsultaACL();

    expect(() =>
      acl.converter({ categoria: 'Ferragens', textoLivreResidual: '' }, CATALOGO_CATEGORIAS),
    ).toThrow(BedrockInterpretacaoConsultaACLInvalidaError);
  });

  it('propaga erro de domínio quando precoMinimo/precoMaximo estruturado é inválido (ex.: moeda divergente)', () => {
    const acl = new BedrockInterpretacaoConsultaACL();

    expect(() =>
      acl.converter(
        {
          precoMinimo: { valorCentavos: 100, moeda: 'BRL' },
          precoMaximo: { valorCentavos: 200, moeda: 'USD' },
          textoLivreResidual: '',
        },
        CATALOGO_CATEGORIAS,
      ),
    ).toThrow();
  });
});
