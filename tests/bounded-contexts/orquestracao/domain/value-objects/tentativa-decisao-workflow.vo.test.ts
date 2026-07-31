import { describe, expect, it } from 'vitest';
import {
  TentativaDecisaoWorkflow,
  TentativaDecisaoWorkflowInvalidaError,
} from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/tentativa-decisao-workflow.vo.js';
import { DecisaoRoteamento } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';

const timestamp = new Date('2026-07-31T10:00:00Z');

const decisaoAprovada = DecisaoRoteamento.criar({
  acao: 'ENCAMINHAR_COMPRADOR',
  nivelConfianca: NivelConfianca.de(90),
  criterio: 'confiança suficiente',
  agenteOrigem: 'ORQUESTRADOR',
  requerIntegracaoExterna: false,
});

describe('TentativaDecisaoWorkflow', () => {
  it('aceita tentativa com resultado (decisão bem-sucedida)', () => {
    const tentativa = TentativaDecisaoWorkflow.de({
      agente: 'ORQUESTRADOR',
      timestamp,
      resultado: decisaoAprovada,
    });
    expect(tentativa.resultado).toBe(decisaoAprovada);
    expect(tentativa.motivoInsucesso).toBeUndefined();
    expect(tentativa.agente).toBe('ORQUESTRADOR');
  });

  it('aceita tentativa com motivoInsucesso (confiança insuficiente, escalonada)', () => {
    const tentativa = TentativaDecisaoWorkflow.de({
      agente: 'ORQUESTRADOR',
      timestamp,
      motivoInsucesso: 'nivelConfianca 45 abaixo do limiar 80',
    });
    expect(tentativa.motivoInsucesso).toBe('nivelConfianca 45 abaixo do limiar 80');
    expect(tentativa.resultado).toBeUndefined();
  });

  it('aceita tentativa de decisão humana com resultado', () => {
    const decisaoHumana = DecisaoRoteamento.criar({
      acao: 'ENCAMINHAR_COMPRADOR',
      nivelConfianca: null,
      criterio: 'decisão humana registrada via portal',
      agenteOrigem: 'HUMANO',
      requerIntegracaoExterna: false,
    });
    const tentativa = TentativaDecisaoWorkflow.de({
      agente: 'HUMANO',
      timestamp,
      resultado: decisaoHumana,
    });
    expect(tentativa.agente).toBe('HUMANO');
    expect(tentativa.resultado).toBe(decisaoHumana);
  });

  it('rejeita ausência de resultado e motivoInsucesso — nunca tentativa sem desfecho', () => {
    expect(() => TentativaDecisaoWorkflow.de({ agente: 'ORQUESTRADOR', timestamp })).toThrow(
      TentativaDecisaoWorkflowInvalidaError,
    );
  });

  it('rejeita motivoInsucesso vazio/whitespace', () => {
    expect(() =>
      TentativaDecisaoWorkflow.de({ agente: 'ORQUESTRADOR', timestamp, motivoInsucesso: '   ' }),
    ).toThrow(TentativaDecisaoWorkflowInvalidaError);
  });

  it('rejeita resultado e motivoInsucesso simultâneos — mutuamente exclusivos', () => {
    expect(() =>
      TentativaDecisaoWorkflow.de({
        agente: 'ORQUESTRADOR',
        timestamp,
        resultado: decisaoAprovada,
        motivoInsucesso: 'não deveria vir junto',
      }),
    ).toThrow(TentativaDecisaoWorkflowInvalidaError);
  });

  it('rejeita timestamp inválido', () => {
    expect(() =>
      TentativaDecisaoWorkflow.de({
        agente: 'ORQUESTRADOR',
        timestamp: new Date('inválida'),
        resultado: decisaoAprovada,
      }),
    ).toThrow(TentativaDecisaoWorkflowInvalidaError);
  });
});
