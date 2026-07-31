import { describe, expect, it } from 'vitest';
import {
  ContextoImutavelError,
  ContextoIncompletoError,
  DecisaoWorkflow,
  JustificativaHumanaAusenteError,
  TransicaoInvalidaDecisaoWorkflowError,
} from '../../../../../src/bounded-contexts/orquestracao/domain/aggregates/decisao-workflow.aggregate.js';
import { ContextoClassificacao } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-classificacao.vo.js';
import { ContextoExtracao } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-extracao.vo.js';
import { ContextoValidacao } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/contexto-validacao.vo.js';
import {
  CriterioAusenteError,
  ReenvioSemFundamentoError,
} from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/decisao-roteamento.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/orquestracao/domain/value-objects/orcamento-id.vo.js';

const orcamentoId = OrcamentoId.de('018f5b3a-1234-7abc-89ab-0123456789ab');

const contextoClassificacao = ContextoClassificacao.de({
  fornecedorIdentificado: 'Fornecedor XPTO',
  formatoIdentificado: 'PDF',
});
const outroContextoClassificacao = ContextoClassificacao.de({
  fornecedorIdentificado: 'Fornecedor Divergente',
  formatoIdentificado: 'PDF',
});

const contextoExtracao = ContextoExtracao.de({
  itensResumo: '3 itens de ferramentas',
  condicoesComerciaisResumo: '30 dias',
  houvePendenciaConfirmada: false,
});
const outroContextoExtracao = ContextoExtracao.de({
  itensResumo: '5 itens divergentes',
  condicoesComerciaisResumo: '30 dias',
  houvePendenciaConfirmada: false,
});

const contextoValidacaoAprovavel = ContextoValidacao.de({ resultado: 'VALIDADO' });
const outroContextoValidacao = ContextoValidacao.de({
  resultado: 'VALIDADO_COM_RESSALVA',
  inconsistenciasAceitas: [{ regra: 'PRECO_DIVERGENTE', detalhe: 'aceito pelo comprador' }],
});
const contextoValidacaoComRessalva = ContextoValidacao.de({
  resultado: 'VALIDADO_COM_RESSALVA',
  inconsistenciasAceitas: [{ regra: 'PRECO_DIVERGENTE', detalhe: 'aceito pelo comprador' }],
});

function criarComContextoConsolidado(
  contextoValidacao = contextoValidacaoAprovavel,
): DecisaoWorkflow {
  const decisao = DecisaoWorkflow.criar(orcamentoId);
  decisao.registrarContextoClassificacao(contextoClassificacao);
  decisao.registrarContextoExtracao(contextoExtracao);
  decisao.registrarContextoValidacao(contextoValidacao);
  decisao.consolidarContexto();
  return decisao;
}

describe('DecisaoWorkflow', () => {
  it('inicia em AGUARDANDO_CONTEXTO, sem contexto, sem decisão, sem histórico', () => {
    const decisao = DecisaoWorkflow.criar(orcamentoId);
    expect(decisao.status).toBe('AGUARDANDO_CONTEXTO');
    expect(decisao.contextoClassificacao).toBeUndefined();
    expect(decisao.contextoExtracao).toBeUndefined();
    expect(decisao.contextoValidacao).toBeUndefined();
    expect(decisao.decisaoAtual).toBeUndefined();
    expect(decisao.historico).toHaveLength(0);
  });

  describe('registrarContexto*', () => {
    it('registra os 3 contextos sem transicionar status por si só', () => {
      const decisao = DecisaoWorkflow.criar(orcamentoId);
      decisao.registrarContextoClassificacao(contextoClassificacao);
      expect(decisao.status).toBe('AGUARDANDO_CONTEXTO');

      decisao.registrarContextoExtracao(contextoExtracao);
      expect(decisao.status).toBe('AGUARDANDO_CONTEXTO');

      decisao.registrarContextoValidacao(contextoValidacaoAprovavel);
      expect(decisao.status).toBe('AGUARDANDO_CONTEXTO');

      expect(decisao.contextoClassificacao).toBe(contextoClassificacao);
      expect(decisao.contextoExtracao).toBe(contextoExtracao);
      expect(decisao.contextoValidacao).toBe(contextoValidacaoAprovavel);
    });

    it('é idempotente — reaplicar o mesmo contexto não lança erro', () => {
      const decisao = DecisaoWorkflow.criar(orcamentoId);
      decisao.registrarContextoClassificacao(contextoClassificacao);

      expect(() => decisao.registrarContextoClassificacao(contextoClassificacao)).not.toThrow();
      expect(decisao.contextoClassificacao).toBe(contextoClassificacao);
    });

    it('rejeita reentrega com payload divergente do já registrado — ContextoImutavelError (classificação)', () => {
      const decisao = DecisaoWorkflow.criar(orcamentoId);
      decisao.registrarContextoClassificacao(contextoClassificacao);

      expect(() => decisao.registrarContextoClassificacao(outroContextoClassificacao)).toThrow(
        ContextoImutavelError,
      );
      expect(decisao.contextoClassificacao).toBe(contextoClassificacao);
    });

    it('rejeita reentrega com payload divergente do já registrado — ContextoImutavelError (extração)', () => {
      const decisao = DecisaoWorkflow.criar(orcamentoId);
      decisao.registrarContextoExtracao(contextoExtracao);

      expect(() => decisao.registrarContextoExtracao(outroContextoExtracao)).toThrow(
        ContextoImutavelError,
      );
      expect(decisao.contextoExtracao).toBe(contextoExtracao);
    });

    it('rejeita reentrega com payload divergente do já registrado — ContextoImutavelError (validação)', () => {
      const decisao = DecisaoWorkflow.criar(orcamentoId);
      decisao.registrarContextoValidacao(contextoValidacaoAprovavel);

      expect(() => decisao.registrarContextoValidacao(outroContextoValidacao)).toThrow(
        ContextoImutavelError,
      );
      expect(decisao.contextoValidacao).toBe(contextoValidacaoAprovavel);
    });
  });

  describe('consolidarContexto', () => {
    it('transita para CONTEXTO_CONSOLIDADO quando os 3 contextos estão presentes', () => {
      const decisao = criarComContextoConsolidado();
      expect(decisao.status).toBe('CONTEXTO_CONSOLIDADO');
    });

    it('lança ContextoIncompletoError e permanece AGUARDANDO_CONTEXTO quando falta contexto', () => {
      const decisao = DecisaoWorkflow.criar(orcamentoId);
      decisao.registrarContextoClassificacao(contextoClassificacao);

      expect(() => decisao.consolidarContexto()).toThrow(ContextoIncompletoError);
      expect(decisao.status).toBe('AGUARDANDO_CONTEXTO');
    });

    it('lança ContextoIncompletoError quando falta especificamente contextoClassificacao', () => {
      const decisao = DecisaoWorkflow.criar(orcamentoId);
      decisao.registrarContextoExtracao(contextoExtracao);
      decisao.registrarContextoValidacao(contextoValidacaoAprovavel);

      expect(() => decisao.consolidarContexto()).toThrow(ContextoIncompletoError);
      expect(decisao.status).toBe('AGUARDANDO_CONTEXTO');
    });

    it('é no-op quando reaplicado após DECIDIDO — nunca reverte status já avançado (reentrega de evento)', () => {
      const decisao = criarComContextoConsolidado();
      decisao.registrarTentativaOrquestrador({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'confiança suficiente',
        requerIntegracaoExterna: false,
      });
      expect(decisao.status).toBe('DECIDIDO');

      decisao.consolidarContexto();

      expect(decisao.status).toBe('DECIDIDO');
      expect(decisao.historico).toHaveLength(1);
    });

    it('é no-op quando reaplicado após PENDENTE_REVISAO_HUMANA — nunca reverte para CONTEXTO_CONSOLIDADO', () => {
      const decisao = criarComContextoConsolidado();
      decisao.registrarTentativaOrquestrador({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(40),
        criterio: 'confiança baixa',
        requerIntegracaoExterna: false,
      });
      expect(decisao.status).toBe('PENDENTE_REVISAO_HUMANA');

      decisao.consolidarContexto();

      expect(decisao.status).toBe('PENDENTE_REVISAO_HUMANA');
    });
  });

  describe('registrarTentativaOrquestrador', () => {
    it('só pode ser chamado a partir de CONTEXTO_CONSOLIDADO', () => {
      const decisao = DecisaoWorkflow.criar(orcamentoId);

      expect(() =>
        decisao.registrarTentativaOrquestrador({
          acao: 'ENCAMINHAR_COMPRADOR',
          nivelConfianca: NivelConfianca.de(90),
          criterio: 'confiança suficiente',
          requerIntegracaoExterna: false,
        }),
      ).toThrow(TransicaoInvalidaDecisaoWorkflowError);
    });

    it('confiança suficiente transita para DECIDIDO e registra a decisão', () => {
      const decisao = criarComContextoConsolidado();
      decisao.registrarTentativaOrquestrador({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'confiança suficiente, sem pendência',
        requerIntegracaoExterna: false,
      });

      expect(decisao.status).toBe('DECIDIDO');
      expect(decisao.decisaoAtual?.acao).toBe('ENCAMINHAR_COMPRADOR');
      expect(decisao.decisaoAtual?.agenteOrigem).toBe('ORQUESTRADOR');
      expect(decisao.historico).toHaveLength(1);
      expect(decisao.historico[0]?.resultado).toBe(decisao.decisaoAtual);
    });

    it('confiança insuficiente transita direto para PENDENTE_REVISAO_HUMANA, nunca decide', () => {
      const decisao = criarComContextoConsolidado();
      decisao.registrarTentativaOrquestrador({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(45),
        criterio: 'confiança baixa',
        requerIntegracaoExterna: false,
      });

      expect(decisao.status).toBe('PENDENTE_REVISAO_HUMANA');
      expect(decisao.decisaoAtual).toBeUndefined();
      expect(decisao.historico).toHaveLength(1);
      expect(decisao.historico[0]?.motivoInsucesso).toContain('abaixo do limiar');
    });

    it('aprova quando contextoValidacao é VALIDADO_COM_RESSALVA (também aprovável)', () => {
      const decisao = criarComContextoConsolidado(contextoValidacaoComRessalva);

      decisao.registrarTentativaOrquestrador({
        acao: 'APROVAR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'ressalva aceita, confiança suficiente',
        requerIntegracaoExterna: false,
      });

      expect(decisao.status).toBe('DECIDIDO');
      expect(decisao.decisaoAtual?.acao).toBe('APROVAR');
    });

    it('decisão automática sem critério lança CriterioAusenteError sem mutar estado', () => {
      const decisao = criarComContextoConsolidado();

      expect(() =>
        decisao.registrarTentativaOrquestrador({
          acao: 'ENCAMINHAR_COMPRADOR',
          nivelConfianca: NivelConfianca.de(90),
          criterio: '   ',
          requerIntegracaoExterna: false,
        }),
      ).toThrow(CriterioAusenteError);

      expect(decisao.status).toBe('CONTEXTO_CONSOLIDADO');
      expect(decisao.decisaoAtual).toBeUndefined();
      expect(decisao.historico).toHaveLength(0);
    });

    it('reenvio sem fundamento lança ReenvioSemFundamentoError sem mutar estado', () => {
      const decisao = criarComContextoConsolidado();

      expect(() =>
        decisao.registrarTentativaOrquestrador({
          acao: 'SOLICITAR_REENVIO',
          nivelConfianca: NivelConfianca.de(90),
          criterio: 'tentativa sem fundamento',
          requerIntegracaoExterna: false,
        }),
      ).toThrow(ReenvioSemFundamentoError);

      expect(decisao.status).toBe('CONTEXTO_CONSOLIDADO');
      expect(decisao.decisaoAtual).toBeUndefined();
      expect(decisao.historico).toHaveLength(0);
    });
  });

  describe('registrarDecisaoHumana', () => {
    it('só é transição válida a partir de PENDENTE_REVISAO_HUMANA', () => {
      const decisao = criarComContextoConsolidado();

      expect(() =>
        decisao.registrarDecisaoHumana({
          acao: 'ENCAMINHAR_COMPRADOR',
          criterio: 'decisão humana fora de ordem',
          requerIntegracaoExterna: false,
        }),
      ).toThrow(TransicaoInvalidaDecisaoWorkflowError);
    });

    it('registra decisão humana sem exigir nivelConfianca, transita para DECIDIDO, nunca apaga histórico', () => {
      const decisao = criarComContextoConsolidado();
      decisao.registrarTentativaOrquestrador({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(40),
        criterio: 'confiança baixa',
        requerIntegracaoExterna: false,
      });
      expect(decisao.status).toBe('PENDENTE_REVISAO_HUMANA');

      decisao.registrarDecisaoHumana({
        acao: 'SOLICITAR_REENVIO',
        criterio: 'comprador identificou item sem preço',
        requerIntegracaoExterna: false,
        motivoDadoAusente: 'preço unitário ausente no item 3, apontado pela Extração',
      });

      expect(decisao.status).toBe('DECIDIDO');
      expect(decisao.decisaoAtual?.acao).toBe('SOLICITAR_REENVIO');
      expect(decisao.decisaoAtual?.agenteOrigem).toBe('HUMANO');
      expect(decisao.decisaoAtual?.nivelConfianca).toBeNull();
      expect(decisao.historico).toHaveLength(2);
      expect(decisao.historico[0]?.motivoInsucesso).toBeDefined();
      expect(decisao.historico[1]?.resultado).toBe(decisao.decisaoAtual);
    });

    it('rejeita SOLICITAR_REENVIO sem fundamento mesmo em decisão humana — ReenvioSemFundamentoError', () => {
      const decisao = criarComContextoConsolidado();
      decisao.registrarTentativaOrquestrador({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(40),
        criterio: 'confiança baixa',
        requerIntegracaoExterna: false,
      });

      expect(() =>
        decisao.registrarDecisaoHumana({
          acao: 'SOLICITAR_REENVIO',
          criterio: 'sem fundamento',
          requerIntegracaoExterna: false,
        }),
      ).toThrow(ReenvioSemFundamentoError);
      expect(decisao.status).toBe('PENDENTE_REVISAO_HUMANA');
      expect(decisao.decisaoAtual).toBeUndefined();
    });

    it('rejeita criterio/justificativa vazia mesmo em decisão humana — JustificativaHumanaAusenteError', () => {
      const decisao = criarComContextoConsolidado();
      decisao.registrarTentativaOrquestrador({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(40),
        criterio: 'confiança baixa',
        requerIntegracaoExterna: false,
      });

      expect(() =>
        decisao.registrarDecisaoHumana({
          acao: 'ENCAMINHAR_COMPRADOR',
          criterio: '   ',
          requerIntegracaoExterna: false,
        }),
      ).toThrow(JustificativaHumanaAusenteError);
      expect(decisao.status).toBe('PENDENTE_REVISAO_HUMANA');
      expect(decisao.decisaoAtual).toBeUndefined();
    });
  });

  describe('reconstituir', () => {
    it('reidrata agregado a partir de estado persistido preservando histórico e contextos', () => {
      const decisao = criarComContextoConsolidado();
      decisao.registrarTentativaOrquestrador({
        acao: 'ENCAMINHAR_COMPRADOR',
        nivelConfianca: NivelConfianca.de(90),
        criterio: 'confiança suficiente',
        requerIntegracaoExterna: false,
      });

      const reidratado = DecisaoWorkflow.reconstituir({
        orcamentoId,
        contextoClassificacao: decisao.contextoClassificacao,
        contextoExtracao: decisao.contextoExtracao,
        contextoValidacao: decisao.contextoValidacao,
        status: decisao.status,
        decisaoAtual: decisao.decisaoAtual,
        historico: decisao.historico,
      });

      expect(reidratado.status).toBe('DECIDIDO');
      expect(reidratado.decisaoAtual).toBe(decisao.decisaoAtual);
      expect(reidratado.historico).toHaveLength(1);
    });

    it('histórico reidratado é cópia defensiva — array de origem não afeta o agregado', () => {
      const historicoOrigem = [...criarComContextoConsolidado().historico];
      const reidratado = DecisaoWorkflow.reconstituir({
        orcamentoId,
        status: 'AGUARDANDO_CONTEXTO',
        historico: historicoOrigem,
      });

      historicoOrigem.push(historicoOrigem[0] as never);

      expect(reidratado.historico).toHaveLength(0);
    });
  });
});
