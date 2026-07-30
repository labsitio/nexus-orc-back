import { describe, expect, it } from 'vitest';
import {
  ReferenciaClassificacao,
  ReferenciaClassificacaoInvalidaError,
} from '../../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-classificacao.vo.js';

describe('ReferenciaClassificacao', () => {
  it('cria a partir do payload copiado do evento OrcamentoClassificado', () => {
    const referencia = ReferenciaClassificacao.de({
      fornecedorIdentificado: 'Fornecedor X',
      formatoIdentificado: 'PDF',
      agenteOrigem: 'CLASSIFICADOR',
    });
    expect(referencia.fornecedorIdentificado).toBe('Fornecedor X');
  });

  it.each(['fornecedorIdentificado', 'formatoIdentificado'] as const)(
    'rejeita %s vazio',
    (campo) => {
      const params = {
        fornecedorIdentificado: 'Fornecedor X',
        formatoIdentificado: 'PDF',
        agenteOrigem: 'CLASSIFICADOR' as const,
        [campo]: '  ',
      };
      expect(() => ReferenciaClassificacao.de(params)).toThrow(
        ReferenciaClassificacaoInvalidaError,
      );
    },
  );
});
