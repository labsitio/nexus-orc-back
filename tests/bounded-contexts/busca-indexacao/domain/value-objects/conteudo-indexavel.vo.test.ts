import { describe, expect, it } from 'vitest';
import {
  ConteudoIndexavel,
  ConteudoIndexavelInvalidoError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/conteudo-indexavel.vo.js';

const propsValidas = {
  resumoFornecedor: 'Fornecedor XYZ Ltda',
  itensDescricao: ['Notebook Dell Inspiron', 'Mouse sem fio'],
  condicoesResumo: 'Pagamento em 30 dias, entrega em 15 dias úteis',
  categorias: ['Informática', 'Periféricos'],
};

describe('ConteudoIndexavel', () => {
  it('aceita conteúdo com pelo menos um campo preenchido', () => {
    const conteudo = ConteudoIndexavel.de(propsValidas);
    expect(conteudo.resumoFornecedor).toBe(propsValidas.resumoFornecedor);
    expect(conteudo.itensDescricao).toEqual(propsValidas.itensDescricao);
    expect(conteudo.condicoesResumo).toBe(propsValidas.condicoesResumo);
    expect(conteudo.categorias).toEqual(propsValidas.categorias);
  });

  it('rejeita quando todos os campos estão vazios (erro de domínio, nunca indexação de conteúdo nulo)', () => {
    expect(() =>
      ConteudoIndexavel.de({
        resumoFornecedor: '',
        itensDescricao: [],
        condicoesResumo: '',
        categorias: [],
      }),
    ).toThrow(ConteudoIndexavelInvalidoError);
  });

  it('rejeita quando os campos existem mas só contêm espaços em branco', () => {
    expect(() =>
      ConteudoIndexavel.de({
        resumoFornecedor: '   ',
        itensDescricao: ['  ', ''],
        condicoesResumo: '   ',
        categorias: ['  '],
      }),
    ).toThrow(ConteudoIndexavelInvalidoError);
  });

  it('aceita quando apenas um campo tem conteúdo real (ex.: só itensDescricao)', () => {
    expect(() =>
      ConteudoIndexavel.de({
        resumoFornecedor: '',
        itensDescricao: ['Item único'],
        condicoesResumo: '',
        categorias: [],
      }),
    ).not.toThrow();
  });

  it('paraTexto serializa os campos não vazios em texto plano', () => {
    const conteudo = ConteudoIndexavel.de(propsValidas);
    const texto = conteudo.paraTexto();
    expect(texto).toContain(propsValidas.resumoFornecedor);
    expect(texto).toContain('Notebook Dell Inspiron');
    expect(texto).toContain(propsValidas.condicoesResumo);
    expect(texto).toContain('Informática, Periféricos');
  });

  it('não reflete mutação do array original após a construção (cópia defensiva)', () => {
    const itensDescricao = ['Item original'];
    const categorias = ['Categoria original'];
    const conteudo = ConteudoIndexavel.de({
      resumoFornecedor: '',
      itensDescricao,
      condicoesResumo: '',
      categorias,
    });

    itensDescricao.push('Item adicionado depois');
    categorias.push('Categoria adicionada depois');

    expect(conteudo.itensDescricao).toEqual(['Item original']);
    expect(conteudo.categorias).toEqual(['Categoria original']);
  });

  it('paraTexto omite campos vazios sem gerar linhas em branco', () => {
    const conteudo = ConteudoIndexavel.de({
      resumoFornecedor: '',
      itensDescricao: ['Item único'],
      condicoesResumo: '',
      categorias: [],
    });
    expect(conteudo.paraTexto()).toBe('Item único');
  });
});
