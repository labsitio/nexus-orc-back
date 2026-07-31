import { describe, expect, it } from 'vitest';
import { AssinaturaEstrutural } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/assinatura-estrutural.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { ResultadoClassificacao } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import {
  SinalCacheIdentificacao,
  SinalCacheIdentificacaoInvalidoError,
} from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/sinal-cache-identificacao.js';

const HASH_VALIDO = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

const resultadoAnterior = ResultadoClassificacao.criar({
  fornecedorIdentificado: 'Fornecedor X',
  formatoIdentificado: 'PDF',
  nivelConfianca: NivelConfianca.de(90),
  agenteOrigem: 'CLASSIFICADOR',
});

describe('SinalCacheIdentificacao', () => {
  it('cria com dados válidos e expõe os campos', () => {
    const assinatura = AssinaturaEstrutural.de(HASH_VALIDO);
    const ultimaConfirmacaoEm = new Date('2026-01-01T00:00:00.000Z');

    const sinal = SinalCacheIdentificacao.criar({
      assinatura,
      resultadoAnterior,
      ultimaConfirmacaoEm,
    });

    expect(sinal.assinatura).toBe(assinatura);
    expect(sinal.resultadoAnterior).toBe(resultadoAnterior);
    expect(sinal.ultimaConfirmacaoEm).toBe(ultimaConfirmacaoEm);
  });

  it('rejeita ultimaConfirmacaoEm inválida', () => {
    expect(() =>
      SinalCacheIdentificacao.criar({
        assinatura: AssinaturaEstrutural.de(HASH_VALIDO),
        resultadoAnterior,
        ultimaConfirmacaoEm: new Date('data-invalida'),
      }),
    ).toThrow(SinalCacheIdentificacaoInvalidoError);
  });
});
