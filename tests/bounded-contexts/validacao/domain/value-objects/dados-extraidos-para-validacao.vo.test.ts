import { describe, expect, it } from 'vitest';
import {
  DadosExtraidosParaValidacao,
  DadosExtraidosParaValidacaoInvalidosError,
} from '../../../../../src/bounded-contexts/validacao/domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/dinheiro.vo.js';
import { ItemParaValidacao } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/item-para-validacao.vo.js';
import { PeriodoValidade } from '../../../../../src/bounded-contexts/validacao/domain/value-objects/periodo-validade.vo.js';

const item = () =>
  ItemParaValidacao.de({
    descricao: 'Item',
    quantidade: 1,
    precoUnitario: Dinheiro.de(1000, 'BRL'),
    extraido: false,
  });

describe('DadosExtraidosParaValidacao', () => {
  it('aceita payload completo traduzido do evento upstream', () => {
    const dados = DadosExtraidosParaValidacao.de({
      cnpjFornecedor: '11222333000181',
      itens: [item()],
      condicoesComerciais: 'à vista',
      dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
      periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
    });
    expect(dados.itens).toHaveLength(1);
  });

  it('paraPayload serializa cnpj, itens, datas ISO e periodoValidade', () => {
    const dados = DadosExtraidosParaValidacao.de({
      cnpjFornecedor: '11222333000181',
      itens: [item()],
      condicoesComerciais: 'à vista',
      dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
      periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
    });
    expect(dados.paraPayload()).toEqual({
      cnpjFornecedor: '11222333000181',
      itens: [item().paraPayload()],
      condicoesComerciais: 'à vista',
      dataEmissaoProposta: '2026-01-10T00:00:00.000Z',
      periodoValidade: '2026-02-10T00:00:00.000Z',
    });
  });

  it('rejeita lista de itens vazia', () => {
    expect(() =>
      DadosExtraidosParaValidacao.de({
        cnpjFornecedor: '11222333000181',
        itens: [],
        condicoesComerciais: 'à vista',
        dataEmissaoProposta: new Date('2026-01-10T00:00:00.000Z'),
        periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
      }),
    ).toThrow(DadosExtraidosParaValidacaoInvalidosError);
  });

  it('rejeita dataEmissaoProposta inválida', () => {
    expect(() =>
      DadosExtraidosParaValidacao.de({
        cnpjFornecedor: '11222333000181',
        itens: [item()],
        condicoesComerciais: 'à vista',
        dataEmissaoProposta: new Date('data-invalida'),
        periodoValidade: PeriodoValidade.de(new Date('2026-02-10T00:00:00.000Z')),
      }),
    ).toThrow(DadosExtraidosParaValidacaoInvalidosError);
  });
});
