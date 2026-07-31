import { describe, expect, it } from 'vitest';
import {
  IndiceOrcamento,
  IndiceOrcamentoInconsistenteError,
  OrigemValidacaoImutavelError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.js';
import { TentativaIndexacaoInvalidaError } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/tentativa-indexacao.vo.js';
import { ConteudoIndexavel } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/conteudo-indexavel.vo.js';
import { Embedding } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/origem-validacao.vo.js';

const orcamentoId = OrcamentoId.de('018f5b3a-1234-7abc-89ab-0123456789ab');
const conteudoIndexavel = ConteudoIndexavel.de({
  resumoFornecedor: 'Fornecedor XPTO',
  itensDescricao: ['Item A', 'Item B'],
  condicoesResumo: '30 dias',
  categorias: ['ferramentas'],
});
const origemValidacao = OrigemValidacao.de('VALIDADO');
const timestamp = new Date('2026-07-31T10:00:00Z');
const embedding = Embedding.de({
  vetor: Array(1024).fill(0.1),
  dimensao: 1024,
  modeloId: 'amazon.titan-embed-text-v2:0',
  geradoEm: timestamp,
});

function criarIndice(): IndiceOrcamento {
  return IndiceOrcamento.criar({ orcamentoId, conteudoIndexavel, origemValidacao });
}

describe('IndiceOrcamento', () => {
  it('inicia em PENDENTE, sem embedding, sem histórico', () => {
    const indice = criarIndice();
    expect(indice.estado).toBe('PENDENTE');
    expect(indice.embedding).toBeUndefined();
    expect(indice.historico).toHaveLength(0);
  });

  it('transita para INDEXADO quando embedding é fornecido na mesma tentativa', () => {
    const indice = criarIndice();
    indice.registrarTentativaIndexacao({ resultado: 'INDEXADO', timestamp, embedding });

    expect(indice.estado).toBe('INDEXADO');
    expect(indice.embedding).toBe(embedding);
    expect(indice.historico).toHaveLength(1);
    expect(indice.historico[0]?.resultado).toBe('INDEXADO');
  });

  it('nunca transita para INDEXADO sem embedding — erro de domínio, sem mutar estado', () => {
    const indice = criarIndice();

    expect(() =>
      indice.registrarTentativaIndexacao({ resultado: 'INDEXADO', timestamp } as never),
    ).toThrow(TentativaIndexacaoInvalidaError);

    expect(indice.estado).toBe('PENDENTE');
    expect(indice.embedding).toBeUndefined();
    expect(indice.historico).toHaveLength(0);
  });

  it('transita para FALHA_INDEXACAO em falha técnica e preserva histórico', () => {
    const indice = criarIndice();
    indice.registrarTentativaIndexacao({
      resultado: 'FALHA_TECNICA',
      timestamp,
      motivoFalha: 'serviço de embeddings indisponível',
    });

    expect(indice.estado).toBe('FALHA_INDEXACAO');
    expect(indice.embedding).toBeUndefined();
    expect(indice.historico).toHaveLength(1);
  });

  it('permite retry sem limite estrutural após FALHA_INDEXACAO, mantendo tentativas anteriores no histórico', () => {
    const indice = criarIndice();
    indice.registrarTentativaIndexacao({
      resultado: 'FALHA_TECNICA',
      timestamp,
      motivoFalha: 'timeout do gateway',
    });
    indice.registrarTentativaIndexacao({
      resultado: 'FALHA_TECNICA',
      timestamp,
      motivoFalha: 'timeout do gateway novamente',
    });
    indice.registrarTentativaIndexacao({ resultado: 'INDEXADO', timestamp, embedding });

    expect(indice.estado).toBe('INDEXADO');
    expect(indice.historico).toHaveLength(3);
    expect(indice.historico.map((t) => t.resultado)).toEqual([
      'FALHA_TECNICA',
      'FALHA_TECNICA',
      'INDEXADO',
    ]);
  });

  it('historico exposto é cópia defensiva — não permite mutar o array interno', () => {
    const indice = criarIndice();
    indice.registrarTentativaIndexacao({
      resultado: 'FALHA_TECNICA',
      timestamp,
      motivoFalha: 'erro qualquer',
    });

    const historicoExposto = indice.historico as TentativaIndexacaoArrayMutavel;
    historicoExposto.push(undefined as never);

    expect(indice.historico).toHaveLength(1);
  });

  it('rejeita sobrescrever conteudoIndexavel fora do construtor', () => {
    const indice = criarIndice();
    const outroConteudo = ConteudoIndexavel.de({
      resumoFornecedor: 'Outro',
      itensDescricao: [],
      condicoesResumo: '',
      categorias: [],
    });

    expect(() => {
      indice.conteudoIndexavel = outroConteudo;
    }).toThrow(OrigemValidacaoImutavelError);
  });

  it('rejeita sobrescrever origemValidacao fora do construtor', () => {
    const indice = criarIndice();

    expect(() => {
      indice.origemValidacao = OrigemValidacao.de('VALIDADO_COM_RESSALVA');
    }).toThrow(OrigemValidacaoImutavelError);
  });

  it('reconstitui agregado já indexado a partir de estado persistido', () => {
    const indice = IndiceOrcamento.reconstituir({
      orcamentoId,
      conteudoIndexavel,
      origemValidacao,
      estado: 'INDEXADO',
      embedding,
      historico: [],
    });

    expect(indice.estado).toBe('INDEXADO');
    expect(indice.embedding).toBe(embedding);
  });

  it('rejeita reidratar estado INDEXADO sem embedding — dado persistido inconsistente', () => {
    expect(() =>
      IndiceOrcamento.reconstituir({
        orcamentoId,
        conteudoIndexavel,
        origemValidacao,
        estado: 'INDEXADO',
        embedding: undefined,
        historico: [],
      }),
    ).toThrow(IndiceOrcamentoInconsistenteError);
  });
});

type TentativaIndexacaoArrayMutavel = unknown[];
