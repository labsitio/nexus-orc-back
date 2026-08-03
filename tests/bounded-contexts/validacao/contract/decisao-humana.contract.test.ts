import { describe, expect, it } from 'vitest';
import {
  decisaoHumanaValidacaoRequestSchema,
  problemDetailsSchema,
  statusValidacaoResponseSchema,
} from '../../../../src/bounded-contexts/validacao/interface/http/decisao-humana.schema.js';
import { orcamentoIdParamSchema } from '../../../../src/bounded-contexts/validacao/interface/http/status.schema.js';
import { paraResposta } from '../../../../src/bounded-contexts/validacao/interface/http/status.controller.js';
import { CategoriaItem } from '../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { InconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import {
  OrcamentoValidacao,
  TransicaoInvalidaValidacaoError,
  type StatusValidacao,
} from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';

/**
 * Contract test T032 (#142, spec 003): `POST
 * /v1/orcamentos/{orcamentoId}/validacao/decisao-humana` — aceito somente em
 * `PENDENTE_REVISAO_HUMANA`; qualquer outro status MUST ser rejeitado (409
 * Problem Details).
 *
 * Fronteira desta task vs T034-T037 (ver tasks.md, Phase 4): este arquivo é o
 * teste de contrato escrito ANTES da implementação de borda — o caso de uso
 * `RegistrarDecisaoHumanaValidacao` (T035) e o controller HTTP (T036) ainda
 * não existem, então não há rota Fastify real para exercitar via
 * `app.inject`. Mesma convenção já usada em `status.contract.test.ts`
 * (T020, antes do controller T026): valida o contrato de borda (Zod,
 * espelhando `docs/openapi.yaml` -> `DecisaoHumanaValidacaoRequest`/
 * `StatusValidacaoResponse`/`ProblemDetails`) e, para o critério de aceite
 * "aceito em PENDENTE_REVISAO_HUMANA; 409 em qualquer outro status",
 * exercita diretamente o único ponto de produção que já implementa essa
 * regra hoje — o agregado `OrcamentoValidacao.registrarDecisaoHumana`
 * (T030) — cuja `TransicaoInvalidaValidacaoError` é exatamente o que o
 * controller (T036) mapeará para 409 Problem Details. Quando T035/T036
 * existirem, este teste deve ser reescrito para `app.inject` real, reusando
 * estes mesmos schemas.
 */

const ORCAMENTO_ID = '018f2f6a-7c2e-7b1a-9c3d-1a2b3c4d5e6f';

function dadosExtraidos(): DadosExtraidosParaValidacao {
  return DadosExtraidosParaValidacao.de({
    cnpjFornecedor: '11222333000181',
    itens: [
      ItemParaValidacao.de({
        descricao: 'Item',
        quantidade: 1,
        precoUnitario: Dinheiro.de(1000, 'BRL'),
        categoria: CategoriaItem.de('Informática'),
        extraido: true,
      }),
    ],
    condicoesComerciais: 'à vista',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
  });
}

function agregadoEmStatus(status: StatusValidacao): OrcamentoValidacao {
  const agregado = OrcamentoValidacao.criar(OrcamentoId.de(ORCAMENTO_ID), dadosExtraidos());

  if (status === 'PENDENTE') {
    return agregado;
  }

  if (status === 'VALIDADO') {
    agregado.avaliarRegrasDeConsistencia([]);
    return agregado;
  }

  const inconsistencias = [
    InconsistenciaDetectada.de('CNPJ_INVALIDO', 'dígito verificador incorreto'),
  ];
  agregado.avaliarRegrasDeConsistencia(inconsistencias);

  if (status === 'PENDENTE_REVISAO_HUMANA') {
    return agregado;
  }

  // VALIDADO_COM_RESSALVA — só alcançável a partir de PENDENTE_REVISAO_HUMANA.
  agregado.registrarDecisaoHumana({ tipo: 'ACEITE_COM_RESSALVA' });
  return agregado;
}

describe('POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana — contrato', () => {
  it('aceita orcamentoId como UUID', () => {
    expect(orcamentoIdParamSchema.parse({ orcamentoId: ORCAMENTO_ID }).orcamentoId).toBe(
      ORCAMENTO_ID,
    );
  });

  it('body CORRECAO_APLICADA com justificativa e dadosCorrigidos é aceito pelo contrato', () => {
    const body = {
      decisao: 'CORRECAO_APLICADA',
      justificativa: 'CNPJ corrigido após contato com o fornecedor.',
      dadosCorrigidos: { cnpjFornecedor: '11222333000181' },
    };

    expect(decisaoHumanaValidacaoRequestSchema.parse(body)).toEqual(body);
  });

  it('body ACEITE_COM_RESSALVA com justificativa (sem dadosCorrigidos) é aceito pelo contrato', () => {
    const body = {
      decisao: 'ACEITE_COM_RESSALVA',
      justificativa:
        'Comprador aceita preço abaixo da faixa por acordo comercial pontual com o fornecedor.',
    };

    expect(decisaoHumanaValidacaoRequestSchema.parse(body)).toEqual(body);
  });

  it('rejeita decisao fora do enum fechado (CORRECAO_APLICADA | ACEITE_COM_RESSALVA)', () => {
    expect(() =>
      decisaoHumanaValidacaoRequestSchema.parse({
        decisao: 'APROVADO_AUTOMATICO',
        justificativa: 'irrelevante',
      }),
    ).toThrow();
  });

  it('rejeita body sem justificativa (obrigatória em docs/openapi.yaml)', () => {
    expect(() =>
      decisaoHumanaValidacaoRequestSchema.parse({ decisao: 'ACEITE_COM_RESSALVA' }),
    ).toThrow();
  });

  it('200 — decisão aceita a partir de PENDENTE_REVISAO_HUMANA: CORRECAO_APLICADA sem inconsistência remanescente transita para VALIDADO', () => {
    const agregado = agregadoEmStatus('PENDENTE_REVISAO_HUMANA');

    agregado.registrarDecisaoHumana({ tipo: 'CORRECAO_APLICADA', inconsistencias: [] });

    expect(agregado.status).toBe('VALIDADO');
    expect(statusValidacaoResponseSchema.parse(paraResposta(agregado))).toEqual(
      paraResposta(agregado),
    );
  });

  it('200 — decisão aceita a partir de PENDENTE_REVISAO_HUMANA: ACEITE_COM_RESSALVA transita para VALIDADO_COM_RESSALVA (terminal)', () => {
    const agregado = agregadoEmStatus('PENDENTE_REVISAO_HUMANA');

    agregado.registrarDecisaoHumana({ tipo: 'ACEITE_COM_RESSALVA' });

    expect(agregado.status).toBe('VALIDADO_COM_RESSALVA');
    expect(statusValidacaoResponseSchema.parse(paraResposta(agregado))).toEqual(
      paraResposta(agregado),
    );
  });

  it.each<StatusValidacao>(['PENDENTE', 'VALIDADO', 'VALIDADO_COM_RESSALVA'])(
    '409 — decisão humana rejeitada quando status atual é %s (só aceita a partir de PENDENTE_REVISAO_HUMANA)',
    (status) => {
      const agregado = agregadoEmStatus(status);

      expect(() => agregado.registrarDecisaoHumana({ tipo: 'ACEITE_COM_RESSALVA' })).toThrow(
        TransicaoInvalidaValidacaoError,
      );

      // O que o controller (T036) mapeará para 409 Problem Details.
      const problem = {
        type: 'https://nexo.internal/problems/transicao-invalida',
        title: 'Ação não permitida para o estado atual do agregado',
        status: 409,
        detail: `Transição inválida: "registrarDecisaoHumana" a partir do status ${status}`,
      };
      expect(problemDetailsSchema.parse(problem)).toEqual(problem);
    },
  );

  it('404 Problem Details para orcamentoId inexistente', () => {
    const problem = {
      type: 'https://nexo.internal/problems/nao-encontrado',
      title: 'Validação não encontrada',
      status: 404,
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });
});
