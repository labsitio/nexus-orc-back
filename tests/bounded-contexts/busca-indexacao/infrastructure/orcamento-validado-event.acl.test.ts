import { describe, expect, it } from 'vitest';
import {
  OrcamentoValidadoEventACL,
  OrcamentoValidadoEventACLInvalidaError,
} from '../../../../src/bounded-contexts/busca-indexacao/infrastructure/orcamento-validado-event.acl.js';

const ORCAMENTO_ID = '018f2e2a-7b3c-7c3d-8a1b-0123456789ab';

function payloadValido(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    orcamentoId: ORCAMENTO_ID,
    itens: [
      {
        descricao: 'Cimento CP-II 50kg',
        quantidade: 10,
        precoUnitario: { valorCentavos: 3500, moeda: 'BRL' },
        categoria: 'MATERIAL_CONSTRUCAO',
        extraido: true,
      },
      {
        descricao: 'Areia média m³',
        quantidade: 5,
        precoUnitario: { valorCentavos: 12000, moeda: 'BRL' },
        categoria: 'MATERIAL_CONSTRUCAO',
        extraido: false,
      },
    ],
    condicoesComerciais: 'Pagamento em 30 dias, frete incluso',
    ...overrides,
  };
}

describe('OrcamentoValidadoEventACL', () => {
  it('traduz payload de OrcamentoValidado em ConteudoIndexavel + OrigemValidacao VALIDADO', () => {
    const acl = new OrcamentoValidadoEventACL();

    const resultado = acl.traduzir('OrcamentoValidado', payloadValido());

    expect(resultado.orcamentoId.toString()).toBe(ORCAMENTO_ID);
    expect(resultado.origemValidacao.valor).toBe('VALIDADO');
    expect(resultado.conteudoIndexavel.itensDescricao).toEqual([
      'Cimento CP-II 50kg',
      'Areia média m³',
    ]);
    expect(resultado.conteudoIndexavel.condicoesResumo).toBe(
      'Pagamento em 30 dias, frete incluso',
    );
    expect(resultado.conteudoIndexavel.categorias).toEqual(['MATERIAL_CONSTRUCAO']);
  });

  it('traduz payload de OrcamentoValidadoComRessalva em OrigemValidacao VALIDADO_COM_RESSALVA', () => {
    const acl = new OrcamentoValidadoEventACL();

    const resultado = acl.traduzir('OrcamentoValidadoComRessalva', payloadValido());

    expect(resultado.origemValidacao.valor).toBe('VALIDADO_COM_RESSALVA');
  });

  it('deduplica categorias repetidas entre itens, preservando ordem de primeira ocorrência', () => {
    const acl = new OrcamentoValidadoEventACL();
    const payload = payloadValido({
      itens: [
        {
          descricao: 'Item A',
          quantidade: 1,
          precoUnitario: { valorCentavos: 100, moeda: 'BRL' },
          categoria: 'B',
          extraido: false,
        },
        {
          descricao: 'Item B',
          quantidade: 1,
          precoUnitario: { valorCentavos: 100, moeda: 'BRL' },
          categoria: 'A',
          extraido: false,
        },
        {
          descricao: 'Item C',
          quantidade: 1,
          precoUnitario: { valorCentavos: 100, moeda: 'BRL' },
          categoria: 'B',
          extraido: false,
        },
      ],
    });

    const resultado = acl.traduzir('OrcamentoValidado', payload);

    expect(resultado.conteudoIndexavel.categorias).toEqual(['B', 'A']);
  });

  it('trata item sem categoria/descricao sem quebrar a tradução', () => {
    const acl = new OrcamentoValidadoEventACL();
    const payload = payloadValido({
      itens: [
        {
          quantidade: 2,
          precoUnitario: { valorCentavos: 500, moeda: 'BRL' },
          extraido: false,
        },
      ],
    });

    const resultado = acl.traduzir('OrcamentoValidado', payload);

    expect(resultado.conteudoIndexavel.itensDescricao).toEqual(['']);
    expect(resultado.conteudoIndexavel.categorias).toEqual([]);
  });

  it.each([
    ['payload não é objeto', 'string qualquer'],
    ['payload null', null],
    ['orcamentoId ausente', { itens: [], condicoesComerciais: 'x' }],
    ['condicoesComerciais ausente', { orcamentoId: ORCAMENTO_ID, itens: [] }],
    ['itens não é array', payloadValido({ itens: 'não é array' })],
    [
      'item sem quantidade',
      payloadValido({
        itens: [{ precoUnitario: { valorCentavos: 100, moeda: 'BRL' }, extraido: false }],
      }),
    ],
    [
      'item com precoUnitario malformado',
      payloadValido({
        itens: [{ quantidade: 1, precoUnitario: { valorCentavos: '100' }, extraido: false }],
      }),
    ],
  ])('lança OrcamentoValidadoEventACLInvalidaError para %s', (_descricao, payloadInvalido) => {
    const acl = new OrcamentoValidadoEventACL();

    expect(() => acl.traduzir('OrcamentoValidado', payloadInvalido)).toThrow(
      OrcamentoValidadoEventACLInvalidaError,
    );
  });

  it('lança erro de OrcamentoId inválido quando orcamentoId não é UUID v7', () => {
    const acl = new OrcamentoValidadoEventACL();
    const payload = payloadValido({ orcamentoId: 'não-é-uuid' });

    expect(() => acl.traduzir('OrcamentoValidado', payload)).toThrow();
  });

  it('lança erro de ConteudoIndexavel inválido quando payload não tem nenhum conteúdo aproveitável', () => {
    const acl = new OrcamentoValidadoEventACL();
    const payload = payloadValido({ itens: [], condicoesComerciais: '' });

    expect(() => acl.traduzir('OrcamentoValidado', payload)).toThrow();
  });
});
