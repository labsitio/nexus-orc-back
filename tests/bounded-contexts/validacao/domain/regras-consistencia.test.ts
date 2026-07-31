import { describe, expect, it } from 'vitest';
import { CategoriaItem } from '../../../../src/bounded-contexts/validacao/domain/value-objects/categoria-item.vo.js';
import { DadosExtraidosParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { FaixaPreco } from '../../../../src/bounded-contexts/validacao/domain/value-objects/faixa-preco.vo.js';
import { ItemParaValidacao } from '../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { PeriodoValidade } from '../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';
import {
  validarCamposObrigatorios,
  validarCnpjValido,
  validarPrazoCoerente,
  validarPrecoDentroDaFaixa,
} from '../../../../src/bounded-contexts/validacao/domain/regras-consistencia.js';

const itemBase = (overrides: Partial<Parameters<typeof ItemParaValidacao.de>[0]> = {}) =>
  ItemParaValidacao.de({
    descricao: 'Item',
    quantidade: 1,
    precoUnitario: Dinheiro.de(1000, 'BRL'),
    extraido: true,
    ...overrides,
  });

const dadosBase = (overrides: Partial<Parameters<typeof DadosExtraidosParaValidacao.de>[0]> = {}) =>
  DadosExtraidosParaValidacao.de({
    cnpjFornecedor: '11222333000181',
    itens: [itemBase()],
    condicoesComerciais: 'à vista',
    dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
    periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
    ...overrides,
  });

describe('validarCnpjValido', () => {
  it('sem inconsistência para CNPJ válido', () => {
    expect(validarCnpjValido(dadosBase())).toHaveLength(0);
  });

  it('CNPJ_INVALIDO para dígito verificador incorreto', () => {
    const resultado = validarCnpjValido(dadosBase({ cnpjFornecedor: '11222333000180' }));
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.regra).toBe('CNPJ_INVALIDO');
  });

  it('CNPJ_INVALIDO para quantidade de dígitos incorreta', () => {
    const resultado = validarCnpjValido(dadosBase({ cnpjFornecedor: '123' }));
    expect(resultado[0]?.regra).toBe('CNPJ_INVALIDO');
  });
});

describe('validarCamposObrigatorios', () => {
  it('sem inconsistência quando todo item tem descricao', () => {
    expect(validarCamposObrigatorios(dadosBase())).toHaveLength(0);
  });

  it('CAMPO_OBRIGATORIO_AUSENTE quando item sem descricao, mesmo com extraido:true', () => {
    const dados = dadosBase({
      itens: [itemBase({ descricao: undefined, extraido: true })],
    });
    const resultado = validarCamposObrigatorios(dados);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.regra).toBe('CAMPO_OBRIGATORIO_AUSENTE');
  });

  it('CAMPO_OBRIGATORIO_AUSENTE quando item sem descricao e extraido:false — pendência confirmada não isenta a regra', () => {
    const dados = dadosBase({
      itens: [itemBase({ descricao: undefined, extraido: false })],
    });
    expect(validarCamposObrigatorios(dados)).toHaveLength(1);
  });
});

describe('validarPrecoDentroDaFaixa', () => {
  const categoria = CategoriaItem.de('Informática');
  const faixa = FaixaPreco.de(categoria, Dinheiro.de(1000, 'BRL'), Dinheiro.de(5000, 'BRL'));

  it('sem inconsistência quando preço está dentro da faixa da categoria', () => {
    const dados = dadosBase({
      itens: [itemBase({ categoria, precoUnitario: Dinheiro.de(3000, 'BRL') })],
    });
    expect(validarPrecoDentroDaFaixa(dados, [faixa])).toHaveLength(0);
  });

  it('PRECO_FORA_DE_FAIXA quando preço excede o máximo da categoria', () => {
    const dados = dadosBase({
      itens: [itemBase({ categoria, precoUnitario: Dinheiro.de(9999, 'BRL') })],
    });
    const resultado = validarPrecoDentroDaFaixa(dados, [faixa]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.regra).toBe('PRECO_FORA_DE_FAIXA');
  });

  it('não reprova item ainda sem categoria (categorização é responsabilidade da Application)', () => {
    const dados = dadosBase({
      itens: [itemBase({ precoUnitario: Dinheiro.de(999999, 'BRL') })],
    });
    expect(validarPrecoDentroDaFaixa(dados, [faixa])).toHaveLength(0);
  });

  it('não reprova item cuja categoria não tem faixa configurada', () => {
    const outraCategoria = CategoriaItem.de('Serviços');
    const dados = dadosBase({
      itens: [itemBase({ categoria: outraCategoria, precoUnitario: Dinheiro.de(999999, 'BRL') })],
    });
    expect(validarPrecoDentroDaFaixa(dados, [faixa])).toHaveLength(0);
  });
});

describe('validarPrazoCoerente', () => {
  it('sem inconsistência quando validoAte é posterior à emissão', () => {
    expect(validarPrazoCoerente(dadosBase())).toHaveLength(0);
  });

  it('PRAZO_INCOERENTE quando validoAte é anterior à emissão', () => {
    const dados = dadosBase({
      dataEmissaoProposta: new Date('2026-03-01T00:00:00.000Z'),
      periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
    });
    const resultado = validarPrazoCoerente(dados);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.regra).toBe('PRAZO_INCOERENTE');
  });

  it('PRAZO_INCOERENTE quando validoAte é igual à emissão (não estritamente posterior)', () => {
    const mesmaData = new Date('2026-01-10T00:00:00.000Z');
    const dados = dadosBase({
      dataEmissaoProposta: mesmaData,
      periodoValidade: PeriodoValidade.de(mesmaData),
    });
    expect(validarPrazoCoerente(dados)).toHaveLength(1);
  });
});
