import { describe, expect, it } from 'vitest';
import { DadoPessoalAnonimizadoNoContexto } from '../../../src/platform/conformidade/domain/events/dado-pessoal-anonimizado-no-contexto.event.js';
import { RetencaoAplicadaNoContexto } from '../../../src/platform/conformidade/domain/events/retencao-aplicada-no-contexto.event.js';
import { SolicitacaoEsquecimentoConcluida } from '../../../src/platform/conformidade/domain/events/solicitacao-esquecimento-concluida.event.js';
import { SolicitacaoEsquecimentoPrazoExcedido } from '../../../src/platform/conformidade/domain/events/solicitacao-esquecimento-prazo-excedido.event.js';
import { SolicitacaoEsquecimentoRegistrada } from '../../../src/platform/conformidade/domain/events/solicitacao-esquecimento-registrada.event.js';

const solicitacaoId = '018f4b1a-0000-7000-8000-000000000001';
const orcamentoId = '018f4b1a-0000-7000-8000-000000000002';
const titularReferencia = 'titular@example.com';

describe.each([
  {
    nome: 'SolicitacaoEsquecimentoRegistrada',
    detailType: 'SolicitacaoEsquecimentoRegistrada',
    criar: () =>
      new SolicitacaoEsquecimentoRegistrada(
        solicitacaoId,
        titularReferencia,
        ['ingestao-identificacao'],
        '2026-08-30T00:00:00.000Z',
      ),
  },
  {
    nome: 'DadoPessoalAnonimizadoNoContexto',
    detailType: 'DadoPessoalAnonimizadoNoContexto',
    criar: () =>
      new DadoPessoalAnonimizadoNoContexto(solicitacaoId, orcamentoId, 'ingestao-identificacao', [
        {
          campoOriginal: 'contato.email',
          metodo: 'MASCARAMENTO',
          aplicadoEm: '2026-07-31T00:00:00.000Z',
          solicitacaoId,
        },
      ]),
  },
  {
    nome: 'SolicitacaoEsquecimentoConcluida',
    detailType: 'SolicitacaoEsquecimentoConcluida',
    criar: () =>
      new SolicitacaoEsquecimentoConcluida(solicitacaoId, titularReferencia, [
        'ingestao-identificacao',
      ]),
  },
  {
    nome: 'SolicitacaoEsquecimentoPrazoExcedido',
    detailType: 'SolicitacaoEsquecimentoPrazoExcedido',
    criar: () =>
      new SolicitacaoEsquecimentoPrazoExcedido(
        solicitacaoId,
        titularReferencia,
        '2026-08-30T00:00:00.000Z',
        ['ingestao-identificacao'],
      ),
  },
  {
    nome: 'RetencaoAplicadaNoContexto',
    detailType: 'RetencaoAplicadaNoContexto',
    criar: () =>
      new RetencaoAplicadaNoContexto('ingestao-identificacao', 'ORCAMENTO_FORNECEDOR', 3, '30d'),
  },
])('$nome', ({ detailType, criar }) => {
  it(`schemaVersion 1 e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(1);
    expect(evento.detailType).toBe(detailType);
    expect(() => new Date(evento.ocorreuEm)).not.toThrow();
    expect(new Date(evento.ocorreuEm).toISOString()).toBe(evento.ocorreuEm);
  });
});

describe('payload — campos preservados por construtor', () => {
  it('SolicitacaoEsquecimentoRegistrada mantém os campos recebidos', () => {
    const evento = new SolicitacaoEsquecimentoRegistrada(
      solicitacaoId,
      titularReferencia,
      ['ingestao-identificacao'],
      '2026-08-30T00:00:00.000Z',
    );
    expect(evento.solicitacaoId).toBe(solicitacaoId);
    expect(evento.titularReferencia).toBe(titularReferencia);
    expect(evento.contextosEsperados).toEqual(['ingestao-identificacao']);
    expect(evento.prazoLimite).toBe('2026-08-30T00:00:00.000Z');
  });

  it('DadoPessoalAnonimizadoNoContexto mantém os campos recebidos, incluindo camposAnonimizados vazio', () => {
    const evento = new DadoPessoalAnonimizadoNoContexto(
      solicitacaoId,
      orcamentoId,
      'ingestao-identificacao',
      [],
    );
    expect(evento.solicitacaoId).toBe(solicitacaoId);
    expect(evento.orcamentoId).toBe(orcamentoId);
    expect(evento.boundedContext).toBe('ingestao-identificacao');
    expect(evento.camposAnonimizados).toEqual([]);
  });

  it('SolicitacaoEsquecimentoConcluida mantém os campos recebidos', () => {
    const evento = new SolicitacaoEsquecimentoConcluida(solicitacaoId, titularReferencia, [
      'ingestao-identificacao',
    ]);
    expect(evento.solicitacaoId).toBe(solicitacaoId);
    expect(evento.titularReferencia).toBe(titularReferencia);
    expect(evento.contextosConfirmados).toEqual(['ingestao-identificacao']);
  });

  it('SolicitacaoEsquecimentoPrazoExcedido mantém os campos recebidos', () => {
    const evento = new SolicitacaoEsquecimentoPrazoExcedido(
      solicitacaoId,
      titularReferencia,
      '2026-08-30T00:00:00.000Z',
      ['ingestao-identificacao'],
    );
    expect(evento.solicitacaoId).toBe(solicitacaoId);
    expect(evento.titularReferencia).toBe(titularReferencia);
    expect(evento.prazoLimite).toBe('2026-08-30T00:00:00.000Z');
    expect(evento.contextosPendentes).toEqual(['ingestao-identificacao']);
  });

  it('RetencaoAplicadaNoContexto mantém os campos recebidos', () => {
    const evento = new RetencaoAplicadaNoContexto(
      'ingestao-identificacao',
      'ORCAMENTO_FORNECEDOR',
      3,
      '30d',
    );
    expect(evento.boundedContext).toBe('ingestao-identificacao');
    expect(evento.categoria).toBe('ORCAMENTO_FORNECEDOR');
    expect(evento.quantidadeAfetada).toBe(3);
    expect(evento.janelaAplicada).toBe('30d');
  });

  it('ocorreuEm usa Date.now por padrão quando não informado', () => {
    const antes = Date.now();
    const evento = new RetencaoAplicadaNoContexto(
      'ingestao-identificacao',
      'ORCAMENTO_FORNECEDOR',
      0,
      '30d',
    );
    const depois = Date.now();
    const ocorreuEmMs = new Date(evento.ocorreuEm).getTime();
    expect(ocorreuEmMs).toBeGreaterThanOrEqual(antes);
    expect(ocorreuEmMs).toBeLessThanOrEqual(depois);
  });
});
