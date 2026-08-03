import { describe, expect, it } from 'vitest';
import {
  ConfirmacaoDuplicadaError,
  ContextoNaoEsperadoError,
  ContextosEsperadosInvalidosError,
  PrazoLimiteInvalidoError,
  SolicitacaoEsquecimento,
  SolicitacaoJaFinalizadaError,
} from '../../../src/platform/conformidade/domain/solicitacao-esquecimento.aggregate.js';
import { ConfirmacaoAnonimizacao } from '../../../src/platform/conformidade/domain/value-objects/confirmacao-anonimizacao.vo.js';
import { ReferenciaTitular } from '../../../src/platform/conformidade/domain/value-objects/referencia-titular.vo.js';

const titularReferencia = ReferenciaTitular.de('titular@exemplo.com');
const contextosEsperados = ['ingestao-identificacao', 'extracao'];

function criarSolicitacao(prazoLimite = new Date('2099-01-01T00:00:00Z')): SolicitacaoEsquecimento {
  return SolicitacaoEsquecimento.criar({
    titularReferencia,
    contextosEsperados,
    prazoLimite,
    registradaEm: new Date('2026-07-01T00:00:00Z'),
  });
}

function confirmacaoDe(boundedContext: string, confirmadoEm = new Date('2026-07-02T00:00:00Z')) {
  return ConfirmacaoAnonimizacao.de({
    boundedContext,
    orcamentoId: 'orcamento-1',
    camposAnonimizados: [],
    confirmadoEm,
  });
}

describe('SolicitacaoEsquecimento', () => {
  it('inicia em REGISTRADA, sem confirmações', () => {
    const solicitacao = criarSolicitacao();
    expect(solicitacao.status.valor).toBe('REGISTRADA');
    expect(solicitacao.confirmacoes).toHaveLength(0);
  });

  it('transita para EM_ANDAMENTO ao receber confirmação parcial (menos de 100% dos contextosEsperados)', () => {
    const solicitacao = criarSolicitacao();
    solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));

    expect(solicitacao.status.valor).toBe('EM_ANDAMENTO');
    expect(solicitacao.confirmacoes).toHaveLength(1);
  });

  it('transita para CONCLUIDA somente quando confirmacoes cobre 100% de contextosEsperados', () => {
    const solicitacao = criarSolicitacao();
    solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));
    expect(solicitacao.status.valor).not.toBe('CONCLUIDA');

    solicitacao.registrarConfirmacao(confirmacaoDe('extracao'));

    expect(solicitacao.status.valor).toBe('CONCLUIDA');
    expect(solicitacao.confirmacoes).toHaveLength(2);
  });

  it('rejeita confirmação duplicada do mesmo contexto — sem sobrescrever nem somar', () => {
    const solicitacao = criarSolicitacao();
    solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));

    expect(() => solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'))).toThrow(
      ConfirmacaoDuplicadaError,
    );

    expect(solicitacao.confirmacoes).toHaveLength(1);
    expect(solicitacao.status.valor).toBe('EM_ANDAMENTO');
  });

  it('rejeita confirmação de contexto fora de contextosEsperados', () => {
    const solicitacao = criarSolicitacao();

    expect(() => solicitacao.registrarConfirmacao(confirmacaoDe('bc-nao-listado'))).toThrow(
      ContextoNaoEsperadoError,
    );

    expect(solicitacao.confirmacoes).toHaveLength(0);
    expect(solicitacao.status.valor).toBe('REGISTRADA');
  });

  it('rejeita nova confirmação após já estar CONCLUIDA', () => {
    const solicitacao = criarSolicitacao();
    solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));
    solicitacao.registrarConfirmacao(confirmacaoDe('extracao'));

    expect(() => solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'))).toThrow(
      SolicitacaoJaFinalizadaError,
    );
  });

  it('nunca autoconclui por tempo: prazoLimite já expirado não transiciona para CONCLUIDA nem PRAZO_EXCEDIDO sem cobertura total, e o agregado não expõe nenhum método sensível ao relógio', () => {
    const prazoJaExpirado = new Date('2020-01-01T00:00:00Z');
    const solicitacao = criarSolicitacao(prazoJaExpirado);

    // decurso de tempo, isolado, nunca muda o status por si só
    expect(solicitacao.status.valor).toBe('REGISTRADA');

    solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));
    expect(solicitacao.status.valor).toBe('EM_ANDAMENTO');
    expect(solicitacao.status.valor).not.toBe('CONCLUIDA');
    expect(solicitacao.status.valor).not.toBe('PRAZO_EXCEDIDO');

    const metodosPublicos = Object.getOwnPropertyNames(SolicitacaoEsquecimento.prototype).filter(
      (nome) => {
        if (nome === 'constructor') return false;
        const descritor = Object.getOwnPropertyDescriptor(SolicitacaoEsquecimento.prototype, nome);
        return typeof descritor?.value === 'function';
      },
    );

    expect(metodosPublicos).toEqual(['registrarConfirmacao', 'marcarPrazoExcedido']);
  });

  it('marcarPrazoExcedido transita para PRAZO_EXCEDIDO quando invocado explicitamente sem cobertura total', () => {
    const prazoJaExpirado = new Date('2020-01-01T00:00:00Z');
    const solicitacao = criarSolicitacao(prazoJaExpirado);
    solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));
    expect(solicitacao.status.valor).toBe('EM_ANDAMENTO');

    solicitacao.marcarPrazoExcedido();

    expect(solicitacao.status.valor).toBe('PRAZO_EXCEDIDO');
  });

  it('marcarPrazoExcedido funciona a partir de REGISTRADA (nenhuma confirmação recebida)', () => {
    const solicitacao = criarSolicitacao(new Date('2020-01-01T00:00:00Z'));

    solicitacao.marcarPrazoExcedido();

    expect(solicitacao.status.valor).toBe('PRAZO_EXCEDIDO');
  });

  it('rejeita marcarPrazoExcedido se a solicitação já estiver CONCLUIDA', () => {
    const solicitacao = criarSolicitacao();
    solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));
    solicitacao.registrarConfirmacao(confirmacaoDe('extracao'));
    expect(solicitacao.status.valor).toBe('CONCLUIDA');

    expect(() => solicitacao.marcarPrazoExcedido()).toThrow(SolicitacaoJaFinalizadaError);
    expect(solicitacao.status.valor).toBe('CONCLUIDA');
  });

  it('rejeita marcarPrazoExcedido chamado duas vezes (idempotência de transição terminal)', () => {
    const solicitacao = criarSolicitacao(new Date('2020-01-01T00:00:00Z'));
    solicitacao.marcarPrazoExcedido();

    expect(() => solicitacao.marcarPrazoExcedido()).toThrow(SolicitacaoJaFinalizadaError);
    expect(solicitacao.status.valor).toBe('PRAZO_EXCEDIDO');
  });

  it('confirmacoes exposto é cópia defensiva — não permite mutar o array interno', () => {
    const solicitacao = criarSolicitacao();
    solicitacao.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));

    const confirmacoesExpostas = solicitacao.confirmacoes as ConfirmacaoAnonimizacao[];
    confirmacoesExpostas.push(confirmacaoDe('extracao'));

    expect(solicitacao.confirmacoes).toHaveLength(1);
  });

  it('rejeita criação com contextosEsperados vazio — nunca fica permanentemente REGISTRADA sem chance de confirmação', () => {
    expect(() =>
      SolicitacaoEsquecimento.criar({
        titularReferencia,
        contextosEsperados: [],
        prazoLimite: new Date('2099-01-01T00:00:00Z'),
      }),
    ).toThrow(ContextosEsperadosInvalidosError);
  });

  it('rejeita criação com contextosEsperados duplicados', () => {
    expect(() =>
      SolicitacaoEsquecimento.criar({
        titularReferencia,
        contextosEsperados: ['ingestao-identificacao', 'ingestao-identificacao'],
        prazoLimite: new Date('2099-01-01T00:00:00Z'),
      }),
    ).toThrow(ContextosEsperadosInvalidosError);
  });

  it('rejeita criação com prazoLimite inválido', () => {
    expect(() =>
      SolicitacaoEsquecimento.criar({
        titularReferencia,
        contextosEsperados,
        prazoLimite: new Date('data-invalida'),
      }),
    ).toThrow(PrazoLimiteInvalidoError);
  });

  it('reconstitui agregado a partir de estado persistido (EM_ANDAMENTO com confirmação prévia)', () => {
    const solicitacaoOriginal = criarSolicitacao();
    solicitacaoOriginal.registrarConfirmacao(confirmacaoDe('ingestao-identificacao'));

    const solicitacaoReidratada = SolicitacaoEsquecimento.reconstituir({
      id: solicitacaoOriginal.id,
      titularReferencia,
      contextosEsperados,
      prazoLimite: solicitacaoOriginal.prazoLimite,
      registradaEm: solicitacaoOriginal.registradaEm,
      status: solicitacaoOriginal.status,
      confirmacoes: solicitacaoOriginal.confirmacoes,
    });

    expect(solicitacaoReidratada.status.valor).toBe('EM_ANDAMENTO');
    expect(solicitacaoReidratada.confirmacoes).toHaveLength(1);
  });
});
