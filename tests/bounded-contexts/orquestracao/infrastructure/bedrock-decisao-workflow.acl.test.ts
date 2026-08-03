import { describe, expect, it } from 'vitest';
import {
  BedrockDecisaoWorkflowACL,
  BedrockDecisaoWorkflowACLInvalidaError,
  ehDecisaoWorkflowBruta,
  type DecisaoWorkflowBruta,
} from '../../../../src/bounded-contexts/orquestracao/infrastructure/bedrock-decisao-workflow.acl.js';

function decisaoBrutaCompleta(): DecisaoWorkflowBruta {
  return {
    acao: 'APROVAR',
    nivelConfianca: 92,
    criterio: 'Itens e condições consistentes com o histórico do fornecedor',
    requerIntegracaoExterna: false,
  };
}

describe('BedrockDecisaoWorkflowACL', () => {
  it('converte saída bruta válida em ResultadoOrquestrador', () => {
    const resultado = new BedrockDecisaoWorkflowACL().converter(decisaoBrutaCompleta());

    expect(resultado.acao).toBe('APROVAR');
    expect(resultado.nivelConfianca.valor).toBe(92);
    expect(resultado.criterio).toBe('Itens e condições consistentes com o histórico do fornecedor');
    expect(resultado.requerIntegracaoExterna).toBe(false);
    expect(resultado.motivoDadoAusente).toBeUndefined();
  });

  it('preserva motivoDadoAusente quando reportado', () => {
    const bruto: DecisaoWorkflowBruta = {
      ...decisaoBrutaCompleta(),
      acao: 'SOLICITAR_REENVIO',
      motivoDadoAusente: 'Preço unitário do item 3 ausente',
    };

    const resultado = new BedrockDecisaoWorkflowACL().converter(bruto);

    expect(resultado.motivoDadoAusente).toBe('Preço unitário do item 3 ausente');
  });

  it('rejeita resposta sem criterio (mitigação estrutural contra confiança artificial)', () => {
    const bruto: DecisaoWorkflowBruta = { ...decisaoBrutaCompleta(), criterio: '' };

    expect(() => new BedrockDecisaoWorkflowACL().converter(bruto)).toThrow(
      BedrockDecisaoWorkflowACLInvalidaError,
    );
  });

  it('rejeita criterio somente com espaços em branco', () => {
    const bruto: DecisaoWorkflowBruta = { ...decisaoBrutaCompleta(), criterio: '   ' };

    expect(() => new BedrockDecisaoWorkflowACL().converter(bruto)).toThrow(
      BedrockDecisaoWorkflowACLInvalidaError,
    );
  });

  it('rejeita acao fora do catálogo fechado de ACOES_ROTEAMENTO', () => {
    const bruto = { ...decisaoBrutaCompleta(), acao: 'REJEITAR_DEFINITIVAMENTE' };

    expect(() => new BedrockDecisaoWorkflowACL().converter(bruto)).toThrow(
      BedrockDecisaoWorkflowACLInvalidaError,
    );
  });

  it('lança erro de domínio se nivelConfianca reportado estiver fora de 0–100 (nunca confia cegamente no LLM)', () => {
    const bruto: DecisaoWorkflowBruta = { ...decisaoBrutaCompleta(), nivelConfianca: 150 };

    expect(() => new BedrockDecisaoWorkflowACL().converter(bruto)).toThrow();
  });

  it('ehDecisaoWorkflowBruta rejeita shape incompleto', () => {
    expect(ehDecisaoWorkflowBruta({ acao: 'APROVAR' })).toBe(false);
    expect(ehDecisaoWorkflowBruta(null)).toBe(false);
    expect(ehDecisaoWorkflowBruta('texto livre')).toBe(false);
    expect(ehDecisaoWorkflowBruta(decisaoBrutaCompleta())).toBe(true);
  });
});
