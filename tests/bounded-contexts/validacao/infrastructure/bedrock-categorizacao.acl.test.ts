import { describe, expect, it } from 'vitest';
import {
  BedrockCategorizacaoACL,
  BedrockCategorizacaoACLInvalidaError,
  ehCategorizacaoBruta,
} from '../../../../src/bounded-contexts/validacao/infrastructure/bedrock-categorizacao.acl.js';
import { CategoriaItemInvalidaError } from '../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';

const CATALOGO_CATEGORIAS = ['ferragens', 'eletrica', 'hidraulica'] as const;

describe('ehCategorizacaoBruta', () => {
  it('aceita shape com categoria string', () => {
    expect(ehCategorizacaoBruta({ categoria: 'ferragens' })).toBe(true);
  });

  it('rejeita ausência de categoria, null, ou tipo incorreto', () => {
    expect(ehCategorizacaoBruta({})).toBe(false);
    expect(ehCategorizacaoBruta(null)).toBe(false);
    expect(ehCategorizacaoBruta({ categoria: 42 })).toBe(false);
    expect(ehCategorizacaoBruta('ferragens')).toBe(false);
    expect(ehCategorizacaoBruta(undefined)).toBe(false);
  });
});

describe('BedrockCategorizacaoACL', () => {
  it('converte saída estruturada com categoria pertencente ao catálogo em CategoriaItem válida', () => {
    const acl = new BedrockCategorizacaoACL();

    const resultado = acl.converter({ categoria: 'ferragens' }, CATALOGO_CATEGORIAS);

    expect(resultado.valor).toBe('ferragens');
  });

  it('lança BedrockCategorizacaoACLInvalidaError quando a categoria não pertence ao catálogo configurado', () => {
    const acl = new BedrockCategorizacaoACL();

    expect(() =>
      acl.converter({ categoria: 'categoria-inventada-pelo-modelo' }, CATALOGO_CATEGORIAS),
    ).toThrow(BedrockCategorizacaoACLInvalidaError);
  });

  it('nunca aceita categoria fora do catálogo mesmo com grafia parecida a uma categoria válida', () => {
    const acl = new BedrockCategorizacaoACL();

    expect(() => acl.converter({ categoria: 'Ferragens' }, CATALOGO_CATEGORIAS)).toThrow(
      BedrockCategorizacaoACLInvalidaError,
    );
  });

  it('rejeita catálogo vazio configurado — nenhuma categoria é aceita', () => {
    const acl = new BedrockCategorizacaoACL();

    expect(() => acl.converter({ categoria: 'ferragens' }, [])).toThrow(
      BedrockCategorizacaoACLInvalidaError,
    );
  });

  it('propaga erro de domínio quando a categoria pertence ao catálogo mas é string vazia após trim', () => {
    const acl = new BedrockCategorizacaoACL();

    expect(() => acl.converter({ categoria: '' }, ['', 'ferragens'])).toThrow(
      CategoriaItemInvalidaError,
    );
  });
});
