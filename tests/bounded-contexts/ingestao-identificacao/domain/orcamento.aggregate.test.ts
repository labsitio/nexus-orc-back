import { describe, expect, it } from 'vitest';
import {
  LIMIAR_CONFIANCA,
  Orcamento,
  ReferenciaBrutaImutavelError,
  TransicaoInvalidaError,
} from '../../../../src/bounded-contexts/ingestao-identificacao/domain/orcamento.aggregate.js';
import { Canal } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/canal.vo.js';
import { NivelConfianca } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaS3 } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js';
import { ResultadoClassificacao } from '../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/resultado-classificacao.vo.js';

function novoOrcamento(): Orcamento {
  return Orcamento.receber({
    id: OrcamentoId.novo(),
    canal: Canal.de('PORTAL_WEB'),
    referenciaBruta: ReferenciaS3.de({
      bucket: 'nexo-orcamentos-raw',
      key: 'portal/arquivo.pdf',
      versionId: 'v1',
    }),
  });
}

function resultado(
  nivelConfianca: number,
  agenteOrigem: 'CLASSIFICADOR' | 'HUMANO' = 'CLASSIFICADOR',
): ResultadoClassificacao {
  return ResultadoClassificacao.criar({
    fornecedorIdentificado: 'Fornecedor X',
    formatoIdentificado: 'PDF',
    nivelConfianca: NivelConfianca.de(nivelConfianca),
    agenteOrigem,
  });
}

describe('Orcamento', () => {
  it('nasce em RECEBIDO, sem resultado e sem histórico', () => {
    const orcamento = novoOrcamento();
    expect(orcamento.status).toBe('RECEBIDO');
    expect(orcamento.resultadoAtual).toBeUndefined();
    expect(orcamento.historico).toHaveLength(0);
  });

  it(`registrarTentativaClassificador com confiança >= ${LIMIAR_CONFIANCA} transita para CLASSIFICADO`, () => {
    const orcamento = novoOrcamento();
    orcamento.registrarTentativaClassificador(resultado(LIMIAR_CONFIANCA));
    expect(orcamento.status).toBe('CLASSIFICADO');
    expect(orcamento.historico).toHaveLength(1);
  });

  it(`registrarTentativaClassificador com confiança < ${LIMIAR_CONFIANCA} transita direto para PENDENTE_REVISAO_HUMANA, nunca para CLASSIFICADO`, () => {
    const orcamento = novoOrcamento();
    orcamento.registrarTentativaClassificador(resultado(LIMIAR_CONFIANCA - 1));
    expect(orcamento.status).toBe('PENDENTE_REVISAO_HUMANA');
  });

  it('registrarConfirmacaoHumana só é válido a partir de PENDENTE_REVISAO_HUMANA', () => {
    const orcamento = novoOrcamento();
    expect(() => orcamento.registrarConfirmacaoHumana(resultado(90, 'HUMANO'))).toThrow(
      TransicaoInvalidaError,
    );
  });

  it('registrarConfirmacaoHumana confirma e nunca apaga histórico, apenas anexa', () => {
    const orcamento = novoOrcamento();
    orcamento.registrarTentativaClassificador(resultado(50));
    orcamento.registrarConfirmacaoHumana(resultado(95, 'HUMANO'));

    expect(orcamento.status).toBe('CLASSIFICADO');
    expect(orcamento.historico).toHaveLength(2);
  });

  it('atualizarReferenciaBruta sempre lança erro de domínio (referenciaBruta é imutável)', () => {
    const orcamento = novoOrcamento();
    expect(() => orcamento.atualizarReferenciaBruta()).toThrow(ReferenciaBrutaImutavelError);
  });

  it('registrarTentativaClassificador só é válido a partir de RECEBIDO (reentrega SQS não corrompe o agregado)', () => {
    const orcamento = novoOrcamento();
    orcamento.registrarTentativaClassificador(resultado(LIMIAR_CONFIANCA));

    expect(() => orcamento.registrarTentativaClassificador(resultado(LIMIAR_CONFIANCA))).toThrow(
      TransicaoInvalidaError,
    );
    expect(orcamento.historico).toHaveLength(1);
  });

  it.each([
    [100, 'CLASSIFICADO'],
    [0, 'PENDENTE_REVISAO_HUMANA'],
  ] as const)('confiança extrema %d transita para %s', (nivelConfianca, statusEsperado) => {
    const orcamento = novoOrcamento();
    orcamento.registrarTentativaClassificador(resultado(nivelConfianca));
    expect(orcamento.status).toBe(statusEsperado);
  });

  it('registrarTentativaClassificador registra resultadoAtual e histórico com o mesmo resultado recebido', () => {
    const orcamento = novoOrcamento();
    const resultadoRecebido = resultado(LIMIAR_CONFIANCA - 1);
    orcamento.registrarTentativaClassificador(resultadoRecebido);

    expect(orcamento.resultadoAtual).toBe(resultadoRecebido);
    expect(orcamento.historico[0]?.agente).toBe('CLASSIFICADOR');
    expect(orcamento.historico[0]?.resultado).toBe(resultadoRecebido);
  });
});
