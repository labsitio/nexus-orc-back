import { describe, expect, it } from 'vitest';
import {
  OrcamentoExtraidoEventACLImpl,
  OrcamentoExtraidoEventACLPayloadIncompletoError,
} from '../../../../src/bounded-contexts/validacao/infrastructure/orcamento-extraido-event.acl.js';
import { TenantIdInvalidoError } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const orcamentoId = '018f4b1a-0000-7000-8000-000000000000';
const tenantId = '018f5b3a-9999-7abc-89ab-0123456789ab';

function payloadCompleto(overrides: Record<string, unknown> = {}) {
  return {
    orcamentoId,
    itens: [
      {
        descricao: {
          valor: { descricao: 'Parafuso M6' },
          confianca: 95,
          extraido: true,
          agenteOrigem: 'EXTRATOR',
        },
        quantidade: { valor: 100, confianca: 95, extraido: true, agenteOrigem: 'EXTRATOR' },
        precoUnitario: {
          valor: { valorCentavos: 1050, moeda: 'BRL' },
          confianca: 95,
          extraido: true,
          agenteOrigem: 'EXTRATOR',
        },
      },
    ],
    condicoesComerciais: {
      condicoesPagamento: {
        valor: '30 dias',
        confianca: 95,
        extraido: true,
        agenteOrigem: 'EXTRATOR',
      },
      prazoValidade: {
        valor: '2026-12-31T00:00:00.000Z',
        confianca: 95,
        extraido: true,
        agenteOrigem: 'EXTRATOR',
      },
      condicoesEntrega: { valor: 'FOB', confianca: 95, extraido: true, agenteOrigem: 'EXTRATOR' },
    },
    cnpjFornecedor: '11222333000181',
    dataEmissaoProposta: '2026-01-10T00:00:00.000Z',
    tenantId,
    ...overrides,
  };
}

describe('OrcamentoExtraidoEventACLImpl', () => {
  const acl = new OrcamentoExtraidoEventACLImpl();

  it('traduz payload completo (cnpjFornecedor + dataEmissaoProposta presentes) para DadosExtraidosParaValidacao', () => {
    const resultado = acl.traduzir(payloadCompleto());
    expect(resultado.orcamentoId.toString()).toBe(orcamentoId);
    expect(resultado.dadosExtraidos.cnpjFornecedor).toBe('11222333000181');
    expect(resultado.dadosExtraidos.itens).toHaveLength(1);
    expect(resultado.dadosExtraidos.itens[0]?.descricao).toBe('Parafuso M6');
    expect(resultado.dadosExtraidos.itens[0]?.precoUnitario.valorCentavos).toBe(1050);
    expect(resultado.dadosExtraidos.condicoesComerciais).toBe('30 dias | FOB');
    expect(resultado.dadosExtraidos.periodoValidade.paraPayload()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('preserva extraido:false do item mesmo com descricao ausente (pendência confirmada da Extração)', () => {
    const payload = payloadCompleto({
      itens: [
        {
          descricao: { valor: null, confianca: 20, extraido: false, agenteOrigem: 'EXTRATOR' },
          quantidade: { valor: 100, confianca: 95, extraido: true, agenteOrigem: 'EXTRATOR' },
          precoUnitario: {
            valor: { valorCentavos: 1050, moeda: 'BRL' },
            confianca: 95,
            extraido: true,
            agenteOrigem: 'EXTRATOR',
          },
        },
      ],
    });
    const resultado = acl.traduzir(payload);
    expect(resultado.dadosExtraidos.itens[0]?.descricao).toBeUndefined();
    expect(resultado.dadosExtraidos.itens[0]?.extraido).toBe(false);
  });

  it('rejeita payload sem cnpjFornecedor — bloqueio de contrato real (OrcamentoExtraido não publica este campo hoje)', () => {
    const payload = payloadCompleto();
    delete (payload as Record<string, unknown>).cnpjFornecedor;
    expect(() => acl.traduzir(payload)).toThrow(OrcamentoExtraidoEventACLPayloadIncompletoError);
  });

  it('rejeita payload sem dataEmissaoProposta — bloqueio de contrato real (OrcamentoExtraido não publica este campo hoje)', () => {
    const payload = payloadCompleto();
    delete (payload as Record<string, unknown>).dataEmissaoProposta;
    expect(() => acl.traduzir(payload)).toThrow(OrcamentoExtraidoEventACLPayloadIncompletoError);
  });

  it('rejeita item cuja quantidade não foi extraída (não inventa valor)', () => {
    const payload = payloadCompleto({
      itens: [
        {
          descricao: {
            valor: { descricao: 'Item' },
            confianca: 95,
            extraido: true,
            agenteOrigem: 'EXTRATOR',
          },
          quantidade: { valor: null, confianca: 20, extraido: false, agenteOrigem: 'EXTRATOR' },
          precoUnitario: {
            valor: { valorCentavos: 1050, moeda: 'BRL' },
            confianca: 95,
            extraido: true,
            agenteOrigem: 'EXTRATOR',
          },
        },
      ],
    });
    expect(() => acl.traduzir(payload)).toThrow(OrcamentoExtraidoEventACLPayloadIncompletoError);
  });

  it('rejeita condicoesComerciais.prazoValidade não extraída (periodoValidade é obrigatório)', () => {
    const payload = payloadCompleto({
      condicoesComerciais: {
        condicoesPagamento: {
          valor: '30 dias',
          confianca: 95,
          extraido: true,
          agenteOrigem: 'EXTRATOR',
        },
        prazoValidade: { valor: null, confianca: 20, extraido: false, agenteOrigem: 'EXTRATOR' },
        condicoesEntrega: { valor: 'FOB', confianca: 95, extraido: true, agenteOrigem: 'EXTRATOR' },
      },
    });
    expect(() => acl.traduzir(payload)).toThrow(OrcamentoExtraidoEventACLPayloadIncompletoError);
  });

  it('rejeita payload bruto malformado (sem itens/condicoesComerciais)', () => {
    expect(() => acl.traduzir({ orcamentoId })).toThrow(
      OrcamentoExtraidoEventACLPayloadIncompletoError,
    );
  });

  it('rejeita payload não-objeto', () => {
    expect(() => acl.traduzir('nao-e-objeto')).toThrow(
      OrcamentoExtraidoEventACLPayloadIncompletoError,
    );
  });

  it('extrai e valida tenantId quando presente no envelope (issue #649)', () => {
    const resultado = acl.traduzir(payloadCompleto({ tenantId }));
    expect(resultado.tenantId.toString()).toBe(tenantId);
  });

  it('rejeita payload sem tenantId — obrigatório desde o cutover de contract (#632, ADR-008)', () => {
    const payload = payloadCompleto();
    delete (payload as Record<string, unknown>).tenantId;
    expect(() => acl.traduzir(payload)).toThrow(OrcamentoExtraidoEventACLPayloadIncompletoError);
  });

  it('lança erro de TenantId inválido quando tenantId não é UUID v7', () => {
    const payload = payloadCompleto({ tenantId: 'não-é-uuid' });
    expect(() => acl.traduzir(payload)).toThrow(TenantIdInvalidoError);
  });
});
