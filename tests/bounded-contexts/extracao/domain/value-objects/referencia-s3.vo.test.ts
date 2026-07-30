import { describe, expect, it } from 'vitest';
import {
  ReferenciaS3,
  ReferenciaS3InvalidaError,
} from '../../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-s3.vo.js';

describe('ReferenciaS3', () => {
  it('aceita bucket/key/versionId não vazios', () => {
    const referencia = ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'portal/arquivo.pdf',
      versionId: 'v1',
    });
    expect(referencia.bucket).toBe('nexo-orcamentos-raw');
  });

  it.each(['bucket', 'key', 'versionId'] as const)('rejeita %s vazio', (campo) => {
    const params = {
      bucket: 'b',
      key: 'k',
      versionId: 'v1',
      [campo]: '  ',
    };
    expect(() => ReferenciaS3.de(params)).toThrow(ReferenciaS3InvalidaError);
  });
});
