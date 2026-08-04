import { describe, expect, it } from 'vitest';
import { OrcamentoClassificadoEventACLInvalidoError } from '../../../../src/bounded-contexts/orquestracao/domain/errors/evento-upstream-acl.errors.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';
import { OrcamentoClassificadoEventACL } from '../../../../src/bounded-contexts/orquestracao/infrastructure/orcamento-classificado-event.acl.js';

const ORCAMENTO_ID_VALIDO = '01912e2e-7f3a-7c3a-89ab-0123456789ab';

describe('OrcamentoClassificadoEventACL', () => {
  it('traduz o payload bruto de OrcamentoClassificado para ContextoClassificacao', () => {
    const acl = new OrcamentoClassificadoEventACL();

    const resultado = acl.traduzir({
      detailType: 'OrcamentoClassificado',
      schemaVersion: 1,
      orcamentoId: ORCAMENTO_ID_VALIDO,
      ocorreuEm: new Date().toISOString(),
      resultado: {
        fornecedorIdentificado: 'Fornecedor XPTO',
        formatoIdentificado: 'PDF',
        nivelConfianca: 92,
        agenteOrigem: 'CLASSIFICADOR',
      },
      referenciaBruta: { bucket: 'nexo-orcamentos-brutos', chave: 'orcamentos/123.pdf' },
      tenantId: '01912e2e-7f3a-7c3a-89ab-0123456789cd',
    });

    expect(resultado.orcamentoId.equals(OrcamentoId.de(ORCAMENTO_ID_VALIDO))).toBe(true);
    expect(resultado.contextoClassificacao.fornecedorIdentificado).toBe('Fornecedor XPTO');
    expect(resultado.contextoClassificacao.formatoIdentificado).toBe('PDF');
  });

  it('ignora campos extras do payload upstream (ex.: referenciaBruta) sem falhar', () => {
    const acl = new OrcamentoClassificadoEventACL();

    expect(() =>
      acl.traduzir({
        orcamentoId: ORCAMENTO_ID_VALIDO,
        detailType: 'OrcamentoClassificado',
        resultado: { fornecedorIdentificado: 'Fornecedor ABC', formatoIdentificado: 'XML' },
        referenciaBruta: { qualquer: 'coisa' },
        campoDesconhecido: true,
        tenantId: '01912e2e-7f3a-7c3a-89ab-0123456789cd',
      }),
    ).not.toThrow();
  });

  it.each([
    null,
    undefined,
    'texto',
    42,
    {},
    { orcamentoId: ORCAMENTO_ID_VALIDO },
    { orcamentoId: ORCAMENTO_ID_VALIDO, detailType: 'OrcamentoClassificado', resultado: {} },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'OrcamentoClassificado',
      resultado: { fornecedorIdentificado: 'X' },
    },
    {
      orcamentoId: 42,
      detailType: 'OrcamentoClassificado',
      resultado: { fornecedorIdentificado: 'X', formatoIdentificado: 'PDF' },
    },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'OrcamentoExtraido',
      resultado: { fornecedorIdentificado: 'X', formatoIdentificado: 'PDF' },
    },
    {
      orcamentoId: ORCAMENTO_ID_VALIDO,
      resultado: { fornecedorIdentificado: 'X', formatoIdentificado: 'PDF' },
    },
  ])('lança OrcamentoClassificadoEventACLInvalidoError para payload malformado: %j', (bruto) => {
    expect(() => new OrcamentoClassificadoEventACL().traduzir(bruto)).toThrow(
      OrcamentoClassificadoEventACLInvalidoError,
    );
  });

  it('propaga o erro de OrcamentoId inválido quando orcamentoId não é um UUID v7', () => {
    const acl = new OrcamentoClassificadoEventACL();

    expect(() =>
      acl.traduzir({
        orcamentoId: 'nao-eh-um-uuid',
        detailType: 'OrcamentoClassificado',
        resultado: { fornecedorIdentificado: 'Fornecedor XPTO', formatoIdentificado: 'PDF' },
      }),
    ).toThrow();
  });

  // (spec 007, ADR-008 — cutover de contract, #632) tenantId obrigatório no envelope de 001.
  const TENANT_ID_VALIDO = '01912e2e-7f3a-7c3a-89ab-0123456789cd';

  it('extrai tenantId como TenantId quando presente no envelope', () => {
    const acl = new OrcamentoClassificadoEventACL();

    const resultado = acl.traduzir({
      orcamentoId: ORCAMENTO_ID_VALIDO,
      detailType: 'OrcamentoClassificado',
      resultado: { fornecedorIdentificado: 'Fornecedor XPTO', formatoIdentificado: 'PDF' },
      tenantId: TENANT_ID_VALIDO,
    });

    expect(resultado.tenantId.toString()).toBe(TENANT_ID_VALIDO);
  });

  it('rejeita quando tenantId está ausente — obrigatório desde o cutover de contract (#632, ADR-008)', () => {
    const acl = new OrcamentoClassificadoEventACL();

    expect(() =>
      acl.traduzir({
        orcamentoId: ORCAMENTO_ID_VALIDO,
        detailType: 'OrcamentoClassificado',
        resultado: { fornecedorIdentificado: 'Fornecedor XPTO', formatoIdentificado: 'PDF' },
      }),
    ).toThrow(OrcamentoClassificadoEventACLInvalidoError);
  });

  it('lança OrcamentoClassificadoEventACLInvalidoError para tenantId com shape inválido (não string)', () => {
    expect(() =>
      new OrcamentoClassificadoEventACL().traduzir({
        orcamentoId: ORCAMENTO_ID_VALIDO,
        detailType: 'OrcamentoClassificado',
        resultado: { fornecedorIdentificado: 'Fornecedor XPTO', formatoIdentificado: 'PDF' },
        tenantId: 42,
      }),
    ).toThrow(OrcamentoClassificadoEventACLInvalidoError);
  });

  it('propaga o erro de TenantId.de para tenantId malformado (string que não é UUID v7)', () => {
    expect(() =>
      new OrcamentoClassificadoEventACL().traduzir({
        orcamentoId: ORCAMENTO_ID_VALIDO,
        detailType: 'OrcamentoClassificado',
        resultado: { fornecedorIdentificado: 'Fornecedor XPTO', formatoIdentificado: 'PDF' },
        tenantId: 'nao-eh-uuid',
      }),
    ).toThrow(/TenantId inválido/);
  });
});
