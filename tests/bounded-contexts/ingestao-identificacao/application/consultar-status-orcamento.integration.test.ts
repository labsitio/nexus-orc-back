import { describe, expect, it } from 'vitest';
import { ConsultarStatusOrcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/consultar-status-orcamento.js';
import { OrcamentoNaoEncontradoError } from '../../../../src/bounded-contexts/ingestao-identificacao/application/use-cases/consultar-status-orcamento.js';
import { Orcamento } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import type { OrcamentoRepository } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/repositories/orcamento.repository.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { ResultadoClassificacao } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * Integration test (T045/#50): fluxo Classificador<80% -> Escalonamento
 * resulta em status PENDENTE_REVISAO_HUMANA consultável via
 * `ConsultarStatusOrcamento`, com o histórico da tentativa preservado
 * (append-only, nunca sobrescrito). Usa um fake in-memory de
 * `OrcamentoRepository` — o real (`DrizzleOrcamentoRepository`, T011/#16)
 * ainda não está mergeado; este teste depende apenas da interface (T009,
 * já concluída), nunca da implementação Drizzle.
 */
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

describe('ConsultarStatusOrcamento — integração com escalonamento (T045)', () => {
  it('orçamento classificado com confiança <80% fica PENDENTE_REVISAO_HUMANA e consultável, histórico preservado', async () => {
    const repositorio = new OrcamentoRepositoryFake();
    const consultar = new ConsultarStatusOrcamento(repositorio);

    const id = OrcamentoId.novo();
    const tenantId = TenantId.novo();
    const orcamento = Orcamento.receber({
      id,
      canal: Canal.de('PORTAL_WEB'),
      referenciaBruta: criarReferenciaBruta(),
      tenantId,
    });

    const resultadoBaixaConfianca = ResultadoClassificacao.criar({
      fornecedorIdentificado: 'Fornecedor Provável Ltda',
      formatoIdentificado: 'PDF_TABELA_PADRAO',
      nivelConfianca: NivelConfianca.de(62),
      agenteOrigem: 'CLASSIFICADOR',
    });
    orcamento.registrarTentativaClassificador(resultadoBaixaConfianca);
    await repositorio.salvar(orcamento);

    const consultado = await consultar.executar(id.toString(), tenantId);

    expect(consultado.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(consultado.historico).toHaveLength(1);
    expect(consultado.historico[0]?.agente).toBe('CLASSIFICADOR');
    expect(consultado.historico[0]?.resultado).toBe(resultadoBaixaConfianca);
  });

  it('propaga a tentativa do Classificador sem sobrescrever após confirmação humana', async () => {
    const repositorio = new OrcamentoRepositoryFake();
    const consultar = new ConsultarStatusOrcamento(repositorio);

    const id = OrcamentoId.novo();
    const tenantId = TenantId.novo();
    const orcamento = Orcamento.receber({
      id,
      canal: Canal.de('API_REST'),
      referenciaBruta: criarReferenciaBruta(),
      tenantId,
    });

    const tentativaClassificador = ResultadoClassificacao.criar({
      fornecedorIdentificado: 'Fornecedor Incerto',
      formatoIdentificado: 'PLANILHA_XLSX',
      nivelConfianca: NivelConfianca.de(40),
      agenteOrigem: 'CLASSIFICADOR',
    });
    orcamento.registrarTentativaClassificador(tentativaClassificador);

    const confirmacaoHumana = ResultadoClassificacao.criar({
      fornecedorIdentificado: 'Distribuidora ABC Ltda',
      formatoIdentificado: 'PDF_TABELA_PADRAO',
      nivelConfianca: NivelConfianca.de(100),
      agenteOrigem: 'HUMANO',
    });
    orcamento.registrarConfirmacaoHumana(confirmacaoHumana);
    await repositorio.salvar(orcamento);

    const consultado = await consultar.executar(id.toString(), tenantId);

    expect(consultado.status).toBe('CLASSIFICADO');
    expect(consultado.historico).toHaveLength(2);
    expect(consultado.historico[0]?.agente).toBe('CLASSIFICADOR');
    expect(consultado.historico[0]?.resultado).toBe(tentativaClassificador);
    expect(consultado.historico[1]?.agente).toBe('HUMANO');
    expect(consultado.historico[1]?.resultado).toBe(confirmacaoHumana);
  });

  it('lança OrcamentoNaoEncontradoError para orcamentoId inexistente', async () => {
    const repositorio = new OrcamentoRepositoryFake();
    const consultar = new ConsultarStatusOrcamento(repositorio);
    const tenantId = TenantId.novo();

    await expect(
      consultar.executar(OrcamentoId.novo().toString(), tenantId),
    ).rejects.toThrow(OrcamentoNaoEncontradoError);
  });
});
