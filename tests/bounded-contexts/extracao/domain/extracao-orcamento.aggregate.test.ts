import { describe, expect, it } from 'vitest';
import {
  ExtracaoOrcamento,
  ReferenciaImutavelError,
  TenantIdImutavelError,
  TransicaoInvalidaExtracaoError,
} from '../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';
import { CampoExtraido } from '../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../../../../src/bounded-contexts/extracao/domain/value-objects/condicoes-comerciais.vo.js';
import { DescricaoProduto } from '../../../../src/bounded-contexts/extracao/domain/value-objects/descricao-produto.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/extracao/domain/value-objects/dinheiro.vo.js';
import { ItemOrcamento } from '../../../../src/bounded-contexts/extracao/domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/extracao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/extracao/domain/value-objects/periodo-validade.vo.js';
import { Quantidade } from '../../../../src/bounded-contexts/extracao/domain/value-objects/quantidade.vo.js';
import { ReferenciaClassificacao } from '../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-classificacao.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-s3.vo.js';

const confiancaAlta = NivelConfianca.de(95);
const confiancaBaixa = NivelConfianca.de(20);
const TENANT_ID = TenantId.de('01890a5d-ac96-774b-bcce-b302099a8057');

function novaExtracao(): ExtracaoOrcamento {
  return ExtracaoOrcamento.criar(
    OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057'),
    ReferenciaClassificacao.de({
      fornecedorIdentificado: 'Fornecedor X',
      formatoIdentificado: 'PDF',
      agenteOrigem: 'CLASSIFICADOR',
    }),
    ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'portal/arquivo.pdf',
      versionId: 'v1',
    }),
    TENANT_ID,
  );
}

function itemCompleto(agente: 'EXTRATOR' | 'HUMANO' = 'EXTRATOR'): ItemOrcamento {
  return ItemOrcamento.de({
    descricao: CampoExtraido.extraido(DescricaoProduto.de('Parafuso M6'), confiancaAlta, agente),
    quantidade: CampoExtraido.extraido(Quantidade.de(10), confiancaAlta, agente),
    precoUnitario: CampoExtraido.extraido(Dinheiro.de(1099, 'BRL'), confiancaAlta, agente),
  });
}

function itemIncompleto(): ItemOrcamento {
  return ItemOrcamento.de({
    descricao: CampoExtraido.extraido(
      DescricaoProduto.de('Parafuso M6'),
      confiancaAlta,
      'EXTRATOR',
    ),
    quantidade: CampoExtraido.extraido(Quantidade.de(10), confiancaAlta, 'EXTRATOR'),
    precoUnitario: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
  });
}

function condicoesCompletas(agente: 'EXTRATOR' | 'HUMANO' = 'EXTRATOR'): CondicoesComerciais {
  return CondicoesComerciais.de({
    condicoesPagamento: CampoExtraido.extraido('30 dias', confiancaAlta, agente),
    prazoValidade: CampoExtraido.extraido(
      PeriodoValidade.de(new Date('2026-12-31')),
      confiancaAlta,
      agente,
    ),
    condicoesEntrega: CampoExtraido.extraido('FOB', confiancaAlta, agente),
  });
}

describe('ExtracaoOrcamento.criar', () => {
  it('nasce em PENDENTE, sem itens e sem histórico', () => {
    const extracao = novaExtracao();
    expect(extracao.status).toBe('PENDENTE');
    expect(extracao.itens).toHaveLength(0);
    expect(extracao.historico).toHaveLength(0);
  });

  it('(issue #656 — aperto de tipo) nasce com o tenantId obrigatório', () => {
    expect(novaExtracao().tenantId.toString()).toBe(TENANT_ID.toString());
  });

  it('(issue #648) nasce com o tenantId informado', () => {
    const tenantId = TenantId.de('01890a5d-ac96-774b-bcce-b302099a8057');
    const extracao = ExtracaoOrcamento.criar(
      OrcamentoId.de('01890a5d-ac96-774b-bcce-b302099a8057'),
      ReferenciaClassificacao.de({
        fornecedorIdentificado: 'Fornecedor X',
        formatoIdentificado: 'PDF',
        agenteOrigem: 'CLASSIFICADOR',
      }),
      ReferenciaS3.de({
        bucket: 'nexo-orcamentos-raw',
        key: 'portal/arquivo.pdf',
        versionId: 'v1',
      }),
      tenantId,
    );
    expect(extracao.tenantId.toString()).toBe(tenantId.toString());
  });
});

describe('ExtracaoOrcamento.registrarTentativaExtrator', () => {
  it('todos os campos obrigatórios completos transita para EXTRAIDO', () => {
    const extracao = novaExtracao();
    extracao.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());
    expect(extracao.status).toBe('EXTRAIDO');
    expect(extracao.historico).toHaveLength(1);
  });

  it('1+ campo obrigatório sem confiança transita direto para PENDENTE_REVISAO_HUMANA, NUNCA para EXTRAIDO (spec.md: nunca inventa valor)', () => {
    const extracao = novaExtracao();
    extracao.registrarTentativaExtrator([itemIncompleto()], condicoesCompletas());
    expect(extracao.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(extracao.itens[0]?.precoUnitario.extraido).toBe(false);
    expect(extracao.itens[0]?.precoUnitario.valor).toBeNull();
  });

  it('só é válido a partir de PENDENTE (Extrator faz uma única tentativa)', () => {
    const extracao = novaExtracao();
    extracao.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());
    expect(() =>
      extracao.registrarTentativaExtrator([itemCompleto()], condicoesCompletas()),
    ).toThrow(TransicaoInvalidaExtracaoError);
  });
});

describe('ExtracaoOrcamento.registrarConfirmacaoHumana', () => {
  it('só é transição válida a partir de PENDENTE_REVISAO_HUMANA', () => {
    const extracao = novaExtracao();
    expect(() =>
      extracao.registrarConfirmacaoHumana([itemCompleto('HUMANO')], condicoesCompletas('HUMANO')),
    ).toThrow(TransicaoInvalidaExtracaoError);
  });

  it('valor real fornecido pelo humano completa o campo pendente → EXTRAIDO', () => {
    const extracao = novaExtracao();
    extracao.registrarTentativaExtrator([itemIncompleto()], condicoesCompletas());

    extracao.registrarConfirmacaoHumana([itemCompleto('HUMANO')], condicoesCompletas('HUMANO'));

    expect(extracao.status).toBe('EXTRAIDO');
    expect(extracao.historico).toHaveLength(2);
  });

  it('indisponibilidade confirmada pelo humano é decisão definitiva → EXTRAIDO_COM_PENDENCIA_CONFIRMADA', () => {
    const extracao = novaExtracao();
    extracao.registrarTentativaExtrator([itemIncompleto()], condicoesCompletas());

    extracao.registrarConfirmacaoHumana([itemIncompleto()], condicoesCompletas());

    expect(extracao.status).toBe('EXTRAIDO_COM_PENDENCIA_CONFIRMADA');
    expect(extracao.historico).toHaveLength(2);
  });
});

describe('ExtracaoOrcamento — encapsulamento (BUG-001)', () => {
  it('mutar o array retornado por historico/itens não altera o estado interno do agregado', () => {
    const extracao = novaExtracao();
    extracao.registrarTentativaExtrator([itemCompleto()], condicoesCompletas());

    (extracao.historico as unknown[]).length = 0;
    (extracao.itens as unknown[]).length = 0;

    expect(extracao.historico).toHaveLength(1);
    expect(extracao.itens).toHaveLength(1);
  });
});

describe('ExtracaoOrcamento — imutabilidade de referências', () => {
  it('atualizarReferenciaClassificacao sempre lança erro de domínio', () => {
    expect(() => novaExtracao().atualizarReferenciaClassificacao()).toThrow(
      ReferenciaImutavelError,
    );
  });

  it('atualizarReferenciaBrutaS3 sempre lança erro de domínio', () => {
    expect(() => novaExtracao().atualizarReferenciaBrutaS3()).toThrow(ReferenciaImutavelError);
  });

  it('(issue #648) atualizarTenantId sempre lança erro de domínio', () => {
    expect(() => novaExtracao().atualizarTenantId()).toThrow(TenantIdImutavelError);
  });
});
