import { describe, expect, it } from 'vitest';
import {
  orcamentoIdParamSchema,
  problemDetailsSchema,
} from '../../../../src/bounded-contexts/extracao/interface/http/status.schema.js';
import { revisaoHumanaExtracaoBodySchema } from '../../../../src/bounded-contexts/extracao/interface/http/revisao-humana.schema.js';

/**
 * Contract test de `POST /v1/orcamentos/{orcamentoId}/extracao/revisao-humana`
 * (T037/#102) — valida o contrato de borda (Zod) antes/independente do
 * controller real (T039, ainda não implementado). Só aceito em
 * `PENDENTE_REVISAO_HUMANA` (spec.md); 409 Problem Details em qualquer
 * outro status.
 */
describe('POST /v1/orcamentos/{orcamentoId}/extracao/revisao-humana — contrato', () => {
  it('reusa orcamentoIdParamSchema (UUID) do contrato de status', () => {
    expect(() => orcamentoIdParamSchema.parse({ orcamentoId: 'nao-e-uuid' })).toThrow();
  });

  it('aceita campo confirmado com valor real', () => {
    const body = {
      camposConfirmados: [
        {
          caminho: 'itens[0].precoUnitario',
          valor: { montante: 3.2, moeda: 'BRL' },
          indisponivel: false,
        },
      ],
    };
    expect(revisaoHumanaExtracaoBodySchema.parse(body)).toEqual(body);
  });

  it('aceita campo confirmado marcado como indisponível, sem valor', () => {
    const body = {
      camposConfirmados: [
        { caminho: 'condicoesComerciais.prazoValidade', valor: null, indisponivel: true },
      ],
    };
    expect(revisaoHumanaExtracaoBodySchema.parse(body)).toEqual(body);
  });

  it('rejeita campo confirmado sem valor real e sem indisponivel: true (nunca ambos ausentes)', () => {
    expect(() =>
      revisaoHumanaExtracaoBodySchema.parse({
        camposConfirmados: [{ caminho: 'itens[0].quantidade', valor: null, indisponivel: false }],
      }),
    ).toThrow();
  });

  it('rejeita camposConfirmados vazio', () => {
    expect(() => revisaoHumanaExtracaoBodySchema.parse({ camposConfirmados: [] })).toThrow();
  });

  it('rejeita body sem camposConfirmados', () => {
    expect(() => revisaoHumanaExtracaoBodySchema.parse({})).toThrow();
  });

  it('rejeita caminho vazio', () => {
    expect(() =>
      revisaoHumanaExtracaoBodySchema.parse({
        camposConfirmados: [{ caminho: '', valor: 'x', indisponivel: false }],
      }),
    ).toThrow();
  });

  it('409 Problem Details quando status não é PENDENTE_REVISAO_HUMANA', () => {
    const problem = {
      type: 'https://nexo.internal/problems/transicao-invalida',
      title: 'Extração não está pendente de revisão humana',
      status: 409,
    };
    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });
});
