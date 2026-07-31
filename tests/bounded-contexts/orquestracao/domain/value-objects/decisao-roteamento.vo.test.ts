import { describe, expect, it } from 'vitest';
import {
  AprovacaoSemValidacaoError,
  CriterioAusenteError,
  DecisaoRoteamento,
  ReenvioSemFundamentoError,
} from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';

describe('DecisaoRoteamento', () => {
  it('rejeita APROVAR sem contextoValidacao', () => {
    expect(() =>
      DecisaoRoteamento.criar({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'confiança suficiente',
        agenteOrigem: 'ORQUESTRADOR',
        requerIntegracaoExterna: false,
      }),
    ).toThrow(AprovacaoSemValidacaoError);
  });

  it('rejeita APROVAR com contextoValidacao reprovado', () => {
    expect(() =>
      DecisaoRoteamento.criar({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'confiança suficiente',
        agenteOrigem: 'ORQUESTRADOR',
        requerIntegracaoExterna: false,
        contextoValidacao: { resultado: 'REPROVADO' },
      }),
    ).toThrow(AprovacaoSemValidacaoError);
  });

  it.each(['VALIDADO', 'VALIDADO_COM_RESSALVA'] as const)(
    'aceita APROVAR quando contextoValidacao.resultado é %s',
    (resultado) => {
      const decisao = DecisaoRoteamento.criar({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'confiança suficiente',
        agenteOrigem: 'ORQUESTRADOR',
        requerIntegracaoExterna: false,
        contextoValidacao: { resultado },
      });
      expect(decisao.acao).toBe('APROVAR');
    },
  );

  it('rejeita SOLICITAR_REENVIO sem motivoDadoAusente', () => {
    expect(() =>
      DecisaoRoteamento.criar({
        acao: 'SOLICITAR_REENVIO',
        nivelConfianca: NivelConfianca.de(85),
        criterio: 'dado essencial ausente',
        agenteOrigem: 'ORQUESTRADOR',
        requerIntegracaoExterna: false,
      }),
    ).toThrow(ReenvioSemFundamentoError);
  });

  it('rejeita SOLICITAR_REENVIO com motivoDadoAusente vazio/whitespace', () => {
    expect(() =>
      DecisaoRoteamento.criar({
        acao: 'SOLICITAR_REENVIO',
        nivelConfianca: NivelConfianca.de(85),
        criterio: 'dado essencial ausente',
        agenteOrigem: 'ORQUESTRADOR',
        requerIntegracaoExterna: false,
        motivoDadoAusente: '   ',
      }),
    ).toThrow(ReenvioSemFundamentoError);
  });

  it('aceita SOLICITAR_REENVIO com motivoDadoAusente concreto', () => {
    const decisao = DecisaoRoteamento.criar({
      acao: 'SOLICITAR_REENVIO',
      nivelConfianca: NivelConfianca.de(85),
      criterio: 'validação apontou CNPJ ausente',
      agenteOrigem: 'ORQUESTRADOR',
      requerIntegracaoExterna: false,
      motivoDadoAusente: 'CNPJ do fornecedor ausente no item 3',
    });
    expect(decisao.motivoDadoAusente).toBe('CNPJ do fornecedor ausente no item 3');
  });

  it('rejeita decisão automática (agenteOrigem !== HUMANO) sem criterio', () => {
    expect(() =>
      DecisaoRoteamento.criar({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(50),
        criterio: '',
        agenteOrigem: 'ORQUESTRADOR',
        requerIntegracaoExterna: false,
      }),
    ).toThrow(CriterioAusenteError);
  });

  it('rejeita decisão automática com criterio whitespace', () => {
    expect(() =>
      DecisaoRoteamento.criar({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(50),
        criterio: '   ',
        agenteOrigem: 'ORQUESTRADOR',
        requerIntegracaoExterna: false,
      }),
    ).toThrow(CriterioAusenteError);
  });

  it('decisão humana não exige criterio pela mesma regra de decisão automática', () => {
    const decisao = DecisaoRoteamento.criar({
      acao: 'ENCAMINHAR_COMPRADOR',
      nivelConfianca: null,
      criterio: 'decisão humana registrada via portal',
      agenteOrigem: 'HUMANO',
      requerIntegracaoExterna: false,
    });
    expect(decisao.agenteOrigem).toBe('HUMANO');
  });

  it('aceita ENCAMINHAR_COMPRADOR automático com criterio não vazio', () => {
    const decisao = DecisaoRoteamento.criar({
      acao: 'ENCAMINHAR_COMPRADOR',
      nivelConfianca: NivelConfianca.de(60),
      criterio: 'confiança abaixo do limiar',
      agenteOrigem: 'ORQUESTRADOR',
      requerIntegracaoExterna: false,
    });
    expect(decisao.acao).toBe('ENCAMINHAR_COMPRADOR');
  });
});
