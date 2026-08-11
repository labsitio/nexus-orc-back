import { describe, expect, it } from 'vitest';
import {
  ReferenciaS3,
  ReferenciaS3InvalidaError,
  ReferenciaS3KeyInvalidaError,
} from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';

describe('ReferenciaS3', () => {
  it('cria com bucket/key/versionId validos', () => {
    const ref = ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'sftp-incoming/arquivo.pdf',
      versionId: 'v1',
    });
    expect(ref.bucket).toBe('nexo-orcamentos-raw');
  });

  it.each(['bucket', 'key', 'versionId'] as const)('rejeita %s vazio', (campo) => {
    const params = {
      bucket: 'b',
      key: 'k',
      versionId: 'v',
      [campo]: '',
    };
    expect(() => ReferenciaS3.de(params)).toThrow(ReferenciaS3InvalidaError);
  });

  it('equals compara os tres campos', () => {
    const a = ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' });
    const b = ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' });
    expect(a.equals(b)).toBe(true);
  });

  describe('validacao do segmento final da key (issue #730, ADR-013 emendado)', () => {
    it('aceita key legitima gerada pelo proprio sistema - nome de fornecedor nao e ASCII limpo', () => {
      const key = 'pending-uploads/9c1f1e0e-2b3a-4c9d-9a1e-000000000001-nome com acento (1).pdf';
      const ref = ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key,
        versionId: 'v1',
      });
      expect(ref.key).toBe(key);
    });

    it('rejeita ".." no segmento final', () => {
      expect(() =>
        ReferenciaS3.de({
          bucket: 'b',
          key: 'sftp-incoming/arquivo..pdf',
          versionId: 'v',
        }),
      ).toThrow(ReferenciaS3KeyInvalidaError);
    });

    it("rejeita '\\' (barra invertida) no segmento final", () => {
      expect(() =>
        ReferenciaS3.de({
          bucket: 'b',
          key: 'sftp-incoming/arquivo' + String.fromCharCode(92) + 'nome.pdf',
          versionId: 'v',
        }),
      ).toThrow(ReferenciaS3KeyInvalidaError);
    });

    it('rejeita caractere de controle no segmento final', () => {
      expect(() =>
        ReferenciaS3.de({
          bucket: 'b',
          key: 'sftp-incoming/arquivo' + String.fromCharCode(0) + '.pdf',
          versionId: 'v',
        }),
      ).toThrow(ReferenciaS3KeyInvalidaError);
    });

    it('rejeita segmento final acima de 255 caracteres', () => {
      const nomeLongo = 'a'.repeat(256) + '.pdf';
      expect(() =>
        ReferenciaS3.de({
          bucket: 'b',
          key: `sftp-incoming/${nomeLongo}`,
          versionId: 'v',
        }),
      ).toThrow(ReferenciaS3KeyInvalidaError);
    });

    it('aceita segmento final de exatamente 255 caracteres', () => {
      const nomeNoLimite = 'a'.repeat(255);
      expect(() =>
        ReferenciaS3.de({
          bucket: 'b',
          key: `sftp-incoming/${nomeNoLimite}`,
          versionId: 'v',
        }),
      ).not.toThrow();
    });
  });
});
