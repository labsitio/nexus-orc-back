import { describe, expect, it } from 'vitest';
import { CategoriaItem } from '../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { FaixaPreco } from '../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';
import { InconsistenciaDetectada } from '../../../../src/bounded-contexts/validacao/domain/value-objects/inconsistencia-detectada.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/validacao/domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import {
  DadosExtraidosImutavelError,
  OrcamentoValidacao,
  TransicaoInvalidaValidacaoError,
} from '../../../../src/bounded-contexts/validacao/domain/orcamento-validacao.aggregate.js';
import {
  validarCamposObrigatorios,
  validarCnpjValido,
  validarPrazoCoerente,
  validarPrecoDentroDaFaixa,
} from '../../../../src/bounded-contexts/validacao/domain/regras-consistencia.js';

const orcamentoId = () => OrcamentoId.de('01890a5d-ac96-774b-bcce-b02c8f2726a1');

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

const inconsistencia = () =>
  InconsistenciaDetectada.de('CNPJ_INVALIDO', 'dígito verificador incorreto');

describe('OrcamentoValidacao', () => {
  it('criar() inicia em PENDENTE, sem inconsistências, sem histórico', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    expect(agregado.status).toBe('PENDENTE');
    expect(agregado.inconsistencias).toHaveLength(0);
    expect(agregado.historico).toHaveLength(0);
  });

  it('avaliarRegrasDeConsistencia sem inconsistências transita para VALIDADO e anexa histórico', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    agregado.avaliarRegrasDeConsistencia([]);
    expect(agregado.status).toBe('VALIDADO');
    expect(agregado.historico).toHaveLength(1);
    expect(agregado.historico[0]?.resultado).toBe('VALIDADO');
  });

  it('criar() + avaliarRegrasDeConsistencia com as 4 regras determinísticas (T010) passando transita para VALIDADO', () => {
    const categoria = CategoriaItem.de('Informática');
    const faixasPreco = [
      FaixaPreco.de(categoria, Dinheiro.de(500, 'BRL'), Dinheiro.de(5000, 'BRL')),
    ];
    const dados = DadosExtraidosParaValidacao.de({
      cnpjFornecedor: '11222333000181',
      itens: [
        ItemParaValidacao.de({
          descricao: 'Notebook',
          quantidade: 1,
          precoUnitario: Dinheiro.de(1000, 'BRL'),
          categoria,
          extraido: true,
        }),
      ],
      condicoesComerciais: 'à vista',
      dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
      periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
    });

    const agregado = OrcamentoValidacao.criar(orcamentoId(), dados);
    const inconsistencias = [
      ...validarCnpjValido(dados),
      ...validarCamposObrigatorios(dados),
      ...validarPrecoDentroDaFaixa(dados, faixasPreco),
      ...validarPrazoCoerente(dados),
    ];

    expect(inconsistencias).toHaveLength(0);
    agregado.avaliarRegrasDeConsistencia(inconsistencias);
    expect(agregado.status).toBe('VALIDADO');
  });

  it('avaliarRegrasDeConsistencia com 1+ inconsistência transita direto para PENDENTE_REVISAO_HUMANA', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    agregado.avaliarRegrasDeConsistencia([inconsistencia()]);
    expect(agregado.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(agregado.inconsistencias).toHaveLength(1);
    expect(agregado.historico[0]?.resultado).toBe('INCONSISTENTE');
  });

  it('avaliarRegrasDeConsistencia com múltiplas regras falhando transita direto para PENDENTE_REVISAO_HUMANA (nunca segunda tentativa automática) e inconsistencias lista cada regra específica', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    const cnpjInvalido = InconsistenciaDetectada.de(
      'CNPJ_INVALIDO',
      'dígito verificador incorreto',
    );
    const precoForaFaixa = InconsistenciaDetectada.de(
      'PRECO_FORA_DE_FAIXA',
      'preço unitário acima da faixa da categoria',
    );

    agregado.avaliarRegrasDeConsistencia([cnpjInvalido, precoForaFaixa]);

    expect(agregado.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(agregado.inconsistencias).toHaveLength(2);
    expect(agregado.inconsistencias.map((i) => i.regra)).toEqual([
      'CNPJ_INVALIDO',
      'PRECO_FORA_DE_FAIXA',
    ]);
    expect(agregado.historico[0]?.resultado).toBe('INCONSISTENTE');

    // ADR-001: nunca há uma segunda tentativa automática — só decisão humana reavalia.
    expect(() => agregado.avaliarRegrasDeConsistencia([])).toThrow(TransicaoInvalidaValidacaoError);
    expect(agregado.status).toBe('PENDENTE_REVISAO_HUMANA');
  });

  it('nunca transita para VALIDADO com inconsistência pendente — força segunda avaliação e espera erro de domínio', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    agregado.avaliarRegrasDeConsistencia([inconsistencia()]);
    expect(agregado.status).toBe('PENDENTE_REVISAO_HUMANA');

    expect(() => agregado.avaliarRegrasDeConsistencia([])).toThrow(TransicaoInvalidaValidacaoError);
    expect(agregado.status).toBe('PENDENTE_REVISAO_HUMANA');
  });

  it('registrarDecisaoHumana CORRECAO_APLICADA sem inconsistência remanescente transita para VALIDADO', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    agregado.avaliarRegrasDeConsistencia([inconsistencia()]);
    agregado.registrarDecisaoHumana({ tipo: 'CORRECAO_APLICADA', inconsistencias: [] });
    expect(agregado.status).toBe('VALIDADO');
    expect(agregado.historico).toHaveLength(2);
  });

  it('registrarDecisaoHumana CORRECAO_APLICADA que ainda falha permanece em PENDENTE_REVISAO_HUMANA (nunca autoaprova)', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    agregado.avaliarRegrasDeConsistencia([inconsistencia()]);
    agregado.registrarDecisaoHumana({
      tipo: 'CORRECAO_APLICADA',
      inconsistencias: [inconsistencia()],
    });
    expect(agregado.status).toBe('PENDENTE_REVISAO_HUMANA');
    expect(agregado.historico).toHaveLength(2);
  });

  it('registrarDecisaoHumana ACEITE_COM_RESSALVA transita para VALIDADO_COM_RESSALVA (terminal)', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    agregado.avaliarRegrasDeConsistencia([inconsistencia()]);
    agregado.registrarDecisaoHumana({ tipo: 'ACEITE_COM_RESSALVA' });
    expect(agregado.status).toBe('VALIDADO_COM_RESSALVA');
    expect(agregado.historico).toHaveLength(2);
    expect(agregado.historico[1]?.resultado).toBe('ACEITE_COM_RESSALVA');
    expect(agregado.inconsistencias).toHaveLength(1);
  });

  it('registrarDecisaoHumana só é válida a partir de PENDENTE_REVISAO_HUMANA', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    expect(() => agregado.registrarDecisaoHumana({ tipo: 'ACEITE_COM_RESSALVA' })).toThrow(
      TransicaoInvalidaValidacaoError,
    );
  });

  it('dadosExtraidos nunca é sobrescrito fora do construtor de criação', () => {
    const agregado = OrcamentoValidacao.criar(orcamentoId(), dadosExtraidos());
    expect(() => agregado.atualizarDadosExtraidos()).toThrow(DadosExtraidosImutavelError);
  });
});
