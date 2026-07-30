import { describe, expect, it } from 'vitest';
import {
  orcamentoIdParamSchema,
  problemDetailsSchema,
} from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/status.schema.js';
import { revisaoHumanaBodySchema } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/revisao-humana.schema.js';

/**
 * Contract test de `POST /v1/orcamentos/{orcamentoId}/revisao-humana`
 * (T051/#56) — valida o contrato de borda (Zod) antes/independente do
 * controller real (T053/#58). 409 Problem Details é o contrato de erro
 * quando o status não é `PENDENTE_REVISAO_HUMANA` (spec.md).
 */
describe('POST /v1/orcamentos/{orcamentoId}/revisao-humana — contrato', () => {
  it('aceita body com fornecedor e formato confirmados', () => {
    const body = { fornecedorIdentificado: 'Distribuidora ABC Ltda', formatoIdentificado: 'PDF' };
    expect(revisaoHumanaBodySchema.parse(body)).toEqual(body);
  });

  it('rejeita body sem fornecedorIdentificado ou formatoIdentificado', () => {
    expect(() => revisaoHumanaBodySchema.parse({ formatoIdentificado: 'PDF' })).toThrow();
    expect(() => revisaoHumanaBodySchema.parse({ fornecedorIdentificado: 'Acme' })).toThrow();
  });

  it('rejeita campos vazios', () => {
    expect(() =>
      revisaoHumanaBodySchema.parse({ fornecedorIdentificado: '', formatoIdentificado: 'PDF' }),
    ).toThrow();
  });

  it('reusa orcamentoIdParamSchema (UUID) do contrato de status', () => {
    expect(() => orcamentoIdParamSchema.parse({ orcamentoId: 'nao-e-uuid' })).toThrow();
  });

  it('409 Problem Details quando status não é PENDENTE_REVISAO_HUMANA', () => {
    const problem = {
      type: 'https://nexo.internal/problems/transicao-invalida',
      title: 'Orçamento não está pendente de revisão humana',
      status: 409,
    };
    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });
});
