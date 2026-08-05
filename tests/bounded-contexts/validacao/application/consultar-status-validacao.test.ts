import { describe, expect, it } from 'vitest';
import {
  ConsultarStatusValidacao,
  OrcamentoValidacaoNaoEncontradoError,
} from '../../../../src/bounded-contexts/validacao/application/use-cases/consultar-status-validacao.js';
import { OrcamentoValidacao } from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import type { OrcamentoValidacaoRepository } from '../../../../src/bounded-contexts/validacao/domain/repositories/orcamento-validacao.repository.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const TENANT_ID = TenantId.novo();

/**
 * (T026/#136): fake in-memory de `OrcamentoValidacaoRepository` — o real
 * (`DrizzleOrcamentoValidacaoRepository`, T014) já existe, mas este teste
 * depende apenas da interface (T012), mesmo padrão de
 * `ingestao-identificacao/application/consultar-status-orcamento.integration.test.ts`.
 */
class OrcamentoValidacaoRepositoryFake implements OrcamentoValidacaoRepository {
  private readonly registros = new Map<string, OrcamentoValidacao>();

  async salvar(orcamentoValidacao: OrcamentoValidacao): Promise<void> {
    this.registros.set(orcamentoValidacao.orcamentoId.toString(), orcamentoValidacao);
  }

  async buscarPorOrcamentoId(id: OrcamentoId): Promise<OrcamentoValidacao | undefined> {
    return this.registros.get(id.toString());
  }
}

const dadosExtraidos = () =>
  DadosExtraidosParaValidacao.de({
    cnpjFornecedor: '11222333000181',
    itens: [
      ItemParaValidacao.de({
        descricao: 'Item',
        quantidade: 1,
        precoUnitario: Dinheiro.de(1000, 'BRL'),
        extraido: false,
      }),
    ],
    condicoesComerciais: 'à vista',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
  });

describe('ConsultarStatusValidacao', () => {
  it('retorna o agregado consultável por orcamentoId', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const consultar = new ConsultarStatusValidacao(() => repositorio);

    const id = OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');
    const orcamentoValidacao = OrcamentoValidacao.criar(id, dadosExtraidos(), TENANT_ID);
    orcamentoValidacao.avaliarRegrasDeConsistencia([]);
    await repositorio.salvar(orcamentoValidacao);

    const consultado = await consultar.executar(id.toString(), TENANT_ID);

    expect(consultado.status).toBe('VALIDADO');
    expect(consultado.historico).toHaveLength(1);
  });

  it('lança OrcamentoValidacaoNaoEncontradoError para orcamentoId inexistente', async () => {
    const repositorio = new OrcamentoValidacaoRepositoryFake();
    const consultar = new ConsultarStatusValidacao(() => repositorio);

    await expect(
      consultar.executar('01890a5d-ac96-774b-bcce-b02c8f2726a2', TENANT_ID),
    ).rejects.toThrow(OrcamentoValidacaoNaoEncontradoError);
  });
});
