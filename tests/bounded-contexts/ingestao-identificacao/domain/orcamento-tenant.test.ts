import { describe, expect, it } from 'vitest';
import {
  Orcamento,
  TenantIdImutavelError,
} from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Teste unit T012 (#275, spec 007-isolamento-multitenant-dados), promovido a
 * GREEN pela T014 (#277): `Orcamento.aggregate` lança `TenantIdImutavelError`
 * em qualquer tentativa de sobrescrever `tenantId` após a criação do
 * agregado. `tenantId` segue opcional em `ReceberOrcamentoParams` nesta PR
 * (expand/contract, ADR-008) — vira obrigatório numa PR de contrato futura
 * que também atualiza #279/#280/#281.
 */

function criarReferenciaBruta(): ReferenciaS3 {
  return ReferenciaS3.de({
    bucket: 'nexo-orcamentos-raw',
    key: 'portal-web/2026/08/03/orcamento.pdf',
    versionId: 'v1',
  });
}

describe('Orcamento — imutabilidade de tenantId (T012)', () => {
  it('lança TenantIdImutavelError ao tentar sobrescrever tenantId pós-criação', () => {
    const tenantOriginal = TenantId.novo();
    const tenantForjado = TenantId.novo();

    const orcamento = Orcamento.receber({
      id: OrcamentoId.novo(),
      canal: Canal.de('PORTAL_WEB'),
      referenciaBruta: criarReferenciaBruta(),
      tenantId: tenantOriginal,
    });

    expect(orcamento.tenantId).toBe(tenantOriginal);
    expect(() => {
      orcamento.atualizarTenantId(tenantForjado);
    }).toThrow(TenantIdImutavelError);
  });
});
