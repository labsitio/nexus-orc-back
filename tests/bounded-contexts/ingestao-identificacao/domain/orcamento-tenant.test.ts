import { describe, expect, it } from 'vitest';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Teste unit T012 (#275, spec 007-isolamento-multitenant-dados):
 * `Orcamento.aggregate` MUST lançar `TenantIdImutavelError` em qualquer
 * tentativa de sobrescrever `tenantId` após a criação do agregado.
 *
 * Fronteira T012 vs T014 (ver tasks.md, Phase 3): esta task é exclusivamente
 * o teste, escrito ANTES da implementação — hoje `Orcamento` (spec 001) ainda
 * não tem atributo `tenantId` nem `TenantIdImutavelError` (T014 pendente).
 * Por isso o cenário abaixo está em RED (`it.fails`) por desenho, seguindo o
 * mesmo padrão adotado em T011
 * (`tests/bounded-contexts/ingestao-identificacao/contract/tenant-isolation.test.ts`):
 * quando T014 implementar o atributo imutável e o erro, esta asserção passa
 * a ser verdadeira e o `it.fails` passa a falhar (teste inesperadamente
 * verde), sinalizando que é hora de trocar para `it()` simples.
 */

function criarReferenciaBruta(): ReferenciaS3 {
  return ReferenciaS3.de({
    bucket: 'nexo-orcamentos-raw',
    key: 'portal-web/2026/08/03/orcamento.pdf',
    versionId: 'v1',
  });
}

describe('Orcamento — imutabilidade de tenantId (T012)', () => {
  it.fails(
    'lança TenantIdImutavelError ao tentar sobrescrever tenantId pós-criação (RED — aguarda T014: agregado ainda não carrega tenantId)',
    () => {
      const tenantOriginal = TenantId.novo();
      const tenantForjado = TenantId.novo();

      const orcamento = Orcamento.receber({
        id: OrcamentoId.novo(),
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
        // @ts-expect-error — tenantId ainda não existe em ReceberOrcamentoParams (T014)
        tenantId: tenantOriginal,
      });

      expect(() => {
        // @ts-expect-error — atualizarTenantId ainda não existe no agregado (T014)
        orcamento.atualizarTenantId(tenantForjado);
      }).toThrow('TenantIdImutavelError');
    },
  );
});
