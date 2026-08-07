import { describe, expect, it } from 'vitest';
import {
  dinheiroSchema,
  faixaPrecoCategoriaRequestSchema,
  faixaPrecoCategoriaResponseSchema,
  listaFaixasPrecoCategoriaResponseSchema,
  problemDetailsSchema,
} from '../../../../src/bounded-contexts/validacao/interface/http/faixa-preco-categoria.schema.js';
import { CategoriaItem } from '../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import {
  FaixaPreco,
  FaixaPrecoInvalidaError,
} from '../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';

/**
 * Contract test T038 (#148, spec 003): `POST` / `GET
 * /v1/configuracoes/faixas-preco-categoria` — CRUD simples de parâmetro
 * operacional (transaction script, ver nota de complexidade YAGNI do
 * `plan.md`, seção Interface).
 *
 * Escrito ANTES da implementação de borda (T038, antes de T043/T044) —
 * valida o contrato de forma (Zod, espelhando `docs/openapi.yaml` ->
 * `FaixaPrecoCategoria`/`ProblemDetails`) e a regra de domínio subjacente
 * (`FaixaPreco.de`, T007) isoladamente. O controller HTTP real (T044,
 * `faixa-preco-categoria.controller.ts`) e o repositório (T043) já existem
 * hoje — cobertura via `app.inject` real vive em
 * `faixa-preco-categoria.controller.test.ts`; este arquivo continua válido
 * como teste de contrato/domínio, sem `app.inject`, para não duplicar setup
 * de Fastify.
 * `problemDetailsSchema` é reexportado de `status.schema.ts` (mesmo padrão
 * de reuso já usado em `decisao-humana.schema.ts`), não redefinido aqui.
 */

describe('POST / GET /v1/configuracoes/faixas-preco-categoria — contrato', () => {
  it('body válido é aceito pelo contrato de request', () => {
    const body = {
      categoria: 'embalagens',
      precoMinimo: { valorCentavos: 400, moeda: 'BRL' },
      precoMaximo: { valorCentavos: 1200, moeda: 'BRL' },
    };

    expect(faixaPrecoCategoriaRequestSchema.parse(body)).toEqual(body);
  });

  it('rejeita categoria vazia', () => {
    expect(() =>
      faixaPrecoCategoriaRequestSchema.parse({
        categoria: '',
        precoMinimo: { valorCentavos: 400, moeda: 'BRL' },
        precoMaximo: { valorCentavos: 1200, moeda: 'BRL' },
      }),
    ).toThrow();
  });

  it('rejeita valorCentavos negativo ou não inteiro em Dinheiro', () => {
    expect(() => dinheiroSchema.parse({ valorCentavos: -1, moeda: 'BRL' })).toThrow();
    expect(() => dinheiroSchema.parse({ valorCentavos: 1.5, moeda: 'BRL' })).toThrow();
  });

  it('rejeita moeda ausente/vazia', () => {
    expect(() => dinheiroSchema.parse({ valorCentavos: 400, moeda: '' })).toThrow();
  });

  it('resposta de item único respeita o mesmo contrato do request', () => {
    const resposta = {
      categoria: 'embalagens',
      precoMinimo: { valorCentavos: 400, moeda: 'BRL' },
      precoMaximo: { valorCentavos: 1200, moeda: 'BRL' },
    };

    expect(faixaPrecoCategoriaResponseSchema.parse(resposta)).toEqual(resposta);
  });

  it('GET retorna lista de faixas — schema de array do contrato', () => {
    const lista = [
      {
        categoria: 'embalagens',
        precoMinimo: { valorCentavos: 400, moeda: 'BRL' },
        precoMaximo: { valorCentavos: 1200, moeda: 'BRL' },
      },
      {
        categoria: 'informática',
        precoMinimo: { valorCentavos: 100000, moeda: 'BRL' },
        precoMaximo: { valorCentavos: 500000, moeda: 'BRL' },
      },
    ];

    expect(listaFaixasPrecoCategoriaResponseSchema.parse(lista)).toEqual(lista);
  });

  it('201 — corpo aceito pelo contrato produz FaixaPreco válida no domínio (categoria/precoMinimo/precoMaximo consistentes)', () => {
    const requestBody = faixaPrecoCategoriaRequestSchema.parse({
      categoria: 'embalagens',
      precoMinimo: { valorCentavos: 400, moeda: 'BRL' },
      precoMaximo: { valorCentavos: 1200, moeda: 'BRL' },
    });

    const faixa = FaixaPreco.de(
      CategoriaItem.de(requestBody.categoria),
      Dinheiro.de(requestBody.precoMinimo.valorCentavos, requestBody.precoMinimo.moeda),
      Dinheiro.de(requestBody.precoMaximo.valorCentavos, requestBody.precoMaximo.moeda),
    );

    expect(faixa.categoria.valor).toBe('embalagens');
    expect(faixa.contem(Dinheiro.de(800, 'BRL'))).toBe(true);
  });

  it('400 Problem Details — precoMinimo maior que precoMaximo é rejeitado pelo domínio, mesmo com corpo válido no contrato de forma', () => {
    const requestBody = faixaPrecoCategoriaRequestSchema.parse({
      categoria: 'embalagens',
      precoMinimo: { valorCentavos: 1200, moeda: 'BRL' },
      precoMaximo: { valorCentavos: 400, moeda: 'BRL' },
    });

    let erroCapturado: unknown;
    try {
      FaixaPreco.de(
        CategoriaItem.de(requestBody.categoria),
        Dinheiro.de(requestBody.precoMinimo.valorCentavos, requestBody.precoMinimo.moeda),
        Dinheiro.de(requestBody.precoMaximo.valorCentavos, requestBody.precoMaximo.moeda),
      );
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(FaixaPrecoInvalidaError);

    // O que o controller (T044) mapeará para 400 Problem Details — `detail`
    // deriva da mensagem real lançada pelo VO, não de um literal duplicado,
    // para o teste quebrar se a mensagem de domínio mudar.
    const problem = {
      type: 'https://nexo.internal/problems/faixa-preco-invalida',
      title: 'Faixa de preço inválida',
      status: 400,
      detail: (erroCapturado as Error).message,
    };
    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });

  it('400 Problem Details — precoMinimo e precoMaximo em moedas diferentes é rejeitado pelo domínio', () => {
    const requestBody = faixaPrecoCategoriaRequestSchema.parse({
      categoria: 'embalagens',
      precoMinimo: { valorCentavos: 400, moeda: 'BRL' },
      precoMaximo: { valorCentavos: 1200, moeda: 'USD' },
    });

    let erroCapturado: unknown;
    try {
      FaixaPreco.de(
        CategoriaItem.de(requestBody.categoria),
        Dinheiro.de(requestBody.precoMinimo.valorCentavos, requestBody.precoMinimo.moeda),
        Dinheiro.de(requestBody.precoMaximo.valorCentavos, requestBody.precoMaximo.moeda),
      );
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(FaixaPrecoInvalidaError);
  });

  it('401 Problem Details para requisição sem autenticação Cognito (papel administrativo exigido)', () => {
    const problem = {
      type: 'https://nexo.internal/problems/nao-autenticado',
      title: 'Autenticação obrigatória',
      status: 401,
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });
});
