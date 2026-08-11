import { describe, expect, it } from 'vitest';
import { nomeArquivoSchema } from '../../../../../src/bounded-contexts/ingestao-identificacao/interface/http/upload-url.schema.js';

/**
 * ADR-013 / Issue #723: `nomeArquivo` é entrada não confiável e compõe a key
 * S3 (`s3-armazenamento-bruto.gateway.ts`) sem sanitização adicional — a
 * validação aqui é o único ponto de entrada. `/`, `..` e caractere de
 * controle escapam do prefixo e da lifecycle rule; nome legítimo de
 * fornecedor não é ASCII limpo e não pode ser rejeitado.
 */
describe('nomeArquivoSchema', () => {
  it('rejeita separador de path "/"', () => {
    expect(nomeArquivoSchema.safeParse('sub/orcamento.pdf').success).toBe(false);
  });

  it('rejeita separador de path "\\"', () => {
    expect(nomeArquivoSchema.safeParse('sub\\orcamento.pdf').success).toBe(false);
  });

  it('rejeita sequência ".."', () => {
    expect(nomeArquivoSchema.safeParse('..orcamento.pdf').success).toBe(false);
  });

  it('rejeita caractere de controle', () => {
    expect(nomeArquivoSchema.safeParse(`orcamento${String.fromCharCode(7)}.pdf`).success).toBe(false);
  });

  it('rejeita nome acima do tamanho máximo de 255 caracteres', () => {
    const nomeGigante = `${'a'.repeat(252)}.pdf`; // 256 caracteres
    expect(nomeGigante.length).toBe(256);
    expect(nomeArquivoSchema.safeParse(nomeGigante).success).toBe(false);
  });

  it('rejeita nome vazio', () => {
    expect(nomeArquivoSchema.safeParse('').success).toBe(false);
  });

  it('aceita nome legítimo com acento, espaço, parêntese e hífen', () => {
    const resultado = nomeArquivoSchema.safeParse('Orçamento Fornecedor (São José) - v2.pdf');
    expect(resultado.success).toBe(true);
  });

  it('aceita nome no tamanho máximo exato de 255 caracteres', () => {
    const nomeNoLimite = `${'a'.repeat(251)}.pdf`; // 255 caracteres
    expect(nomeNoLimite.length).toBe(255);
    expect(nomeArquivoSchema.safeParse(nomeNoLimite).success).toBe(true);
  });
});
