import { describe, expect, it } from 'vitest';
import {
  ConsultarStatusIndexacao,
  IndiceOrcamentoNaoEncontradoError,
} from '../../../../src/bounded-contexts/busca-indexacao/application/use-cases/consultar-status-indexacao.js';
import { IndiceOrcamento } from '../../../../src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.js';
import type { IndiceOrcamentoRepository } from '../../../../src/bounded-contexts/busca-indexacao/domain/repositories/indice-orcamento.repository.js';
import { ConteudoIndexavel } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/conteudo-indexavel.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/origem-validacao.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/** Fake in-memory de `IndiceOrcamentoRepository` (T031/#191), mesmo padrão de `validacao/consultar-status-validacao.test.ts`. */
class IndiceOrcamentoRepositoryFake implements IndiceOrcamentoRepository {
  private readonly registros = new Map<string, IndiceOrcamento>();

  async upsert(indiceOrcamento: IndiceOrcamento): Promise<void> {
    this.registros.set(indiceOrcamento.orcamentoId.toString(), indiceOrcamento);
  }

  async buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<IndiceOrcamento | undefined> {
    return this.registros.get(orcamentoId.toString());
  }

  async buscarPorCriterioEVetor(): Promise<never[]> {
    return [];
  }
}

const conteudoIndexavel = () =>
  ConteudoIndexavel.de({
    resumoFornecedor: 'Fornecedor Teste',
    itensDescricao: ['Item A'],
    condicoesResumo: 'à vista',
    categorias: ['papelaria'],
  });

describe('ConsultarStatusIndexacao', () => {
  it('retorna o agregado consultável por orcamentoId quando tenantId corresponde', async () => {
    const repositorio = new IndiceOrcamentoRepositoryFake();
    const consultar = new ConsultarStatusIndexacao(repositorio);
    const tenantId = TenantId.novo();
    const orcamentoId = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');

    await repositorio.upsert(
      IndiceOrcamento.criar({
        orcamentoId,
        tenantId,
        conteudoIndexavel: conteudoIndexavel(),
        origemValidacao: OrigemValidacao.de('VALIDADO'),
      }),
    );

    const consultado = await consultar.executar(tenantId, orcamentoId.toString());

    expect(consultado.orcamentoId.equals(orcamentoId)).toBe(true);
    expect(consultado.estado).toBe('PENDENTE');
  });

  it('lança IndiceOrcamentoNaoEncontradoError para orcamentoId inexistente', async () => {
    const repositorio = new IndiceOrcamentoRepositoryFake();
    const consultar = new ConsultarStatusIndexacao(repositorio);

    await expect(
      consultar.executar(TenantId.novo(), '01890a5d-ac96-774b-bcce-b02c8f2726a2'),
    ).rejects.toThrow(IndiceOrcamentoNaoEncontradoError);
  });

  it('lança IndiceOrcamentoNaoEncontradoError quando tenantId não corresponde ao do agregado (nunca 200 nem vaza existência cross-tenant)', async () => {
    const repositorio = new IndiceOrcamentoRepositoryFake();
    const consultar = new ConsultarStatusIndexacao(repositorio);
    const orcamentoId = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a3');

    await repositorio.upsert(
      IndiceOrcamento.criar({
        orcamentoId,
        tenantId: TenantId.novo(),
        conteudoIndexavel: conteudoIndexavel(),
        origemValidacao: OrigemValidacao.de('VALIDADO'),
      }),
    );

    await expect(consultar.executar(TenantId.novo(), orcamentoId.toString())).rejects.toThrow(
      IndiceOrcamentoNaoEncontradoError,
    );
  });
});
