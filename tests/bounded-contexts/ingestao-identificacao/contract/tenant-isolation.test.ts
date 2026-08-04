import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsultarStatusOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/consultar-status-orcamento.js';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { registrarRotaStatusOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/interface/http/status.controller.js';
import { criarTenantContextMiddleware } from '../../../../src/interface/shared/tenant-context.middleware.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Teste de contrato T011 (#274, spec 007-isolamento-multitenant-dados):
 * `GET /v1/orcamentos/{orcamentoId}/status` com JWT de Tenant A e
 * `orcamentoId` pertencente a Tenant B MUST retornar 404 Problem Details —
 * nunca 200 (leak de dado) nem 403 (confirma para o requisitante que o
 * recurso existe em outro tenant).
 *
 * Fronteira T011 vs T014-T018 (ver tasks.md, Phase 3): esta task nasceu como
 * o teste de contrato, escrito ANTES da implementação (`it.fails` enquanto
 * `Orcamento.aggregate` não tinha `tenantId`/T014, `ConsultarStatusOrcamento`
 * não validava tenant/T017 e `DrizzleOrcamentoRepository` não estendia
 * `DrizzleTenantScopedRepositoryBase`/T018). As três já foram implementadas —
 * o cenário cross-tenant abaixo foi promovido de `it.fails` para `it()`
 * simples (spec-007, ADR-008, #632) e exercita o `TenantContextMiddleware`
 * (T005) plugado na frente do controller real (T047), exatamente como fica
 * em produção.
 */

const { mockVerify, mockCreate } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return { mockVerify, mockCreate: vi.fn(() => ({ verify: mockVerify })) };
});

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

class OrcamentoRepositoryFake implements OrcamentoRepository {
  private readonly registros = new Map<string, Orcamento>();

  async salvar(orcamento: Orcamento): Promise<void> {
    this.registros.set(orcamento.id.toString(), orcamento);
  }

  async buscarPorId(id: OrcamentoId): Promise<Orcamento | undefined> {
    return this.registros.get(id.toString());
  }
}

function criarReferenciaBruta(): ReferenciaS3 {
  return ReferenciaS3.de({
    bucket: 'nexo-orcamentos-raw',
    key: 'portal-web/2026/07/30/orcamento.pdf',
    versionId: 'v1',
  });
}

function appComIsolamentoMultitenant(repositorio: OrcamentoRepository) {
  const app = Fastify();
  const preHandler = criarTenantContextMiddleware({
    userPoolId: 'us-east-1_teste',
    clientId: 'client-teste',
  });
  registrarRotaStatusOrcamento(app, new ConsultarStatusOrcamento(() => repositorio), {
    preHandler,
  });
  return app;
}

describe('GET /v1/orcamentos/{orcamentoId}/status — isolamento multitenant (T011)', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockCreate.mockClear();
  });

  it('JWT de Tenant A + orcamentoId de Tenant B retorna 404 (spec 007, T017)', async () => {
    const tenantA = TenantId.novo();
    const tenantB = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const idDoOrcamentoDeTenantB = OrcamentoId.novo();
    // (spec 007, T017) Agregado tem tenantId de Tenant B
    await repositorio.salvar(
      Orcamento.receber({
        id: idDoOrcamentoDeTenantB,
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
        tenantId: tenantB,
      }),
    );

    // JWT autentica Tenant A
    mockVerify.mockResolvedValue({
      sub: 'usuario-tenant-a',
      'custom:tenant_id': tenantA.toString(),
    });
    const app = appComIsolamentoMultitenant(repositorio);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idDoOrcamentoDeTenantB.toString()}/status`,
      headers: { authorization: 'Bearer token-tenant-a' },
    });

    // (spec 007, T017) Tenant A tentando acessar orcamento de Tenant B → 404,
    // nunca 403 (não revela existência cross-tenant)
    expect(resposta.statusCode).toBe(404);
    expect(resposta.statusCode).not.toBe(403);
    expect(resposta.headers['content-type']).toContain('application/problem+json');

    await app.close();
  });

  it('sem JWT válido (sem claim de tenant), retorna 401 antes de alcançar o controller — nunca revela existência do orcamentoId', async () => {
    const repositorio = new OrcamentoRepositoryFake();
    const idQualquer = OrcamentoId.novo();
    await repositorio.salvar(
      Orcamento.receber({
        id: idQualquer,
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
      }),
    );

    const app = appComIsolamentoMultitenant(repositorio);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idQualquer.toString()}/status`,
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(mockVerify).not.toHaveBeenCalled();

    await app.close();
  });

  it('JWT válido de Tenant A consultando o próprio orcamentoId ainda funciona (200) — middleware não quebra o fluxo de mesmo tenant', async () => {
    const tenantA = TenantId.novo();
    const repositorio = new OrcamentoRepositoryFake();
    const idDoTenantA = OrcamentoId.novo();
    await repositorio.salvar(
      Orcamento.receber({
        id: idDoTenantA,
        canal: Canal.de('PORTAL_WEB'),
        referenciaBruta: criarReferenciaBruta(),
        tenantId: tenantA,
      }),
    );

    mockVerify.mockResolvedValue({
      sub: 'usuario-tenant-a',
      'custom:tenant_id': tenantA.toString(),
    });
    const app = appComIsolamentoMultitenant(repositorio);

    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/orcamentos/${idDoTenantA.toString()}/status`,
      headers: { authorization: 'Bearer token-tenant-a' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ orcamentoId: idDoTenantA.toString() });

    await app.close();
  });
});
