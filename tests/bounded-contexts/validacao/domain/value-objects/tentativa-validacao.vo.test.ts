import { describe, expect, it } from 'vitest';
import { InconsistenciaDetectada } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import {
  TentativaValidacao,
  TentativaValidacaoInvalidaError,
} from '../../../../../src/bounded-contexts/validacao/domain/value-objects/tentativa-validacao.vo.js';

describe('TentativaValidacao', () => {
  it('aceita tentativa VALIDADO sem inconsistências', () => {
    const tentativa = TentativaValidacao.de('VALIDADO', [], new Date());
    expect(tentativa.resultado).toBe('VALIDADO');
  });

  it('aceita tentativa INCONSISTENTE com ao menos uma inconsistência', () => {
    const inconsistencia = InconsistenciaDetectada.de(
      'CNPJ_INVALIDO',
      'dígito verificador incorreto',
    );
    const tentativa = TentativaValidacao.de('INCONSISTENTE', [inconsistencia], new Date());
    expect(tentativa.inconsistencias).toHaveLength(1);
  });

  it('rejeita INCONSISTENTE sem nenhuma inconsistência listada', () => {
    expect(() => TentativaValidacao.de('INCONSISTENTE', [], new Date())).toThrow(
      TentativaValidacaoInvalidaError,
    );
  });

  it('rejeita VALIDADO com inconsistências listadas', () => {
    const inconsistencia = InconsistenciaDetectada.de(
      'CNPJ_INVALIDO',
      'dígito verificador incorreto',
    );
    expect(() => TentativaValidacao.de('VALIDADO', [inconsistencia], new Date())).toThrow(
      TentativaValidacaoInvalidaError,
    );
  });

  it('rejeita timestamp inválido', () => {
    expect(() => TentativaValidacao.de('VALIDADO', [], new Date('data-invalida'))).toThrow(
      TentativaValidacaoInvalidaError,
    );
  });
});
