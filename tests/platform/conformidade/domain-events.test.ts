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
