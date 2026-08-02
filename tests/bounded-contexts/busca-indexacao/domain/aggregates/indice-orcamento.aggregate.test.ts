import { describe, expect, it } from 'vitest';
import {
  IndiceOrcamento,
  IndiceOrcamentoInconsistenteError,
  OrigemValidacaoImutavelError,
  TenantIdImutavelError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/aggregates/indice-orcamento.aggregate.js';
import {
  TentativaIndexacao,
  TentativaIndexacaoInvalidaError,
} from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/tentativa-indexacao.vo.js';
import { ConteudoIndexavel } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/conteudo-indexavel.vo.js';
import { Embedding } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/origem-validacao.vo.js';
import { TenantId } from '../../../../../src/shared-kernel/tenant/tenant-id.vo.js';

const orcamentoId = OrcamentoId.de('018f5b3a-1234-7abc-89ab-0123456789ab');
const tenantId = TenantId.de('018f5b3a-9999-7abc-89ab-0123456789ab');
const outroTenantId = TenantId.de('018f5b3a-8888-7abc-89ab-0123456789ab');
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
  return IndiceOrcamento.criar({ orcamentoId, tenantId, conteudoIndexavel, origemValidacao });
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

  it('expõe conteudoIndexavel e origemValidacao definidos no construtor', () => {
    const indice = criarIndice();
    expect(indice.conteudoIndexavel).toBe(conteudoIndexavel);
    expect(indice.origemValidacao).toBe(origemValidacao);
  });

  it('reconstitui agregado em FALHA_INDEXACAO com histórico prévio, sem exigir embedding', () => {
    const tentativaFalha = TentativaIndexacao.de({
      resultado: 'FALHA_TECNICA',
      timestamp,
      motivoFalha: 'timeout do gateway',
    });

    const indice = IndiceOrcamento.reconstituir({
      orcamentoId,
      tenantId,
      conteudoIndexavel,
      origemValidacao,
      estado: 'FALHA_INDEXACAO',
      embedding: undefined,
      historico: [tentativaFalha],
    });

    expect(indice.estado).toBe('FALHA_INDEXACAO');
    expect(indice.embedding).toBeUndefined();
    expect(indice.historico).toHaveLength(1);
  });

  it('reconstitui com cópia defensiva do histórico — array de origem não afeta o agregado', () => {
    const tentativaFalha = TentativaIndexacao.de({
      resultado: 'FALHA_TECNICA',
      timestamp,
      motivoFalha: 'timeout do gateway',
    });
    const historicoOrigem = [tentativaFalha];

    const indice = IndiceOrcamento.reconstituir({
      orcamentoId,
      tenantId,
      conteudoIndexavel,
      origemValidacao,
      estado: 'FALHA_INDEXACAO',
      embedding: undefined,
      historico: historicoOrigem,
    });

    historicoOrigem.push(tentativaFalha);

    expect(indice.historico).toHaveLength(1);
  });

  it('reconstitui agregado já indexado a partir de estado persistido', () => {
    const indice = IndiceOrcamento.reconstituir({
      orcamentoId,
      tenantId,
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
        tenantId,
        conteudoIndexavel,
        origemValidacao,
        estado: 'INDEXADO',
        embedding: undefined,
        historico: [],
      }),
    ).toThrow(IndiceOrcamentoInconsistenteError);
  });

  it('rejeita sobrescrever tenantId fora do construtor', () => {
    const indice = criarIndice();

    expect(() => {
      indice.tenantId = outroTenantId;
    }).toThrow(TenantIdImutavelError);
  });

  it('expõe tenantId definido no construtor', () => {
    const indice = criarIndice();
    expect(indice.tenantId).toBe(tenantId);
  });

  it('rejeita criação sem tenantId — erro de domínio', () => {
    expect(() =>
      IndiceOrcamento.criar({
        orcamentoId,
        tenantId: undefined as never,
        conteudoIndexavel,
        origemValidacao,
      }),
    ).toThrow(IndiceOrcamentoInconsistenteError);
  });

  it('invariante "nunca omitir por relevância": único método de transição de estado é registrarTentativaIndexacao — nenhum método de exclusão de negócio exposto', () => {
    const metodosPublicos = Object.getOwnPropertyNames(IndiceOrcamento.prototype).filter((nome) => {
      if (nome === 'constructor') return false;
      const descritor = Object.getOwnPropertyDescriptor(IndiceOrcamento.prototype, nome);
      return typeof descritor?.value === 'function';
    });

    expect(metodosPublicos.sort()).toEqual(['registrarTentativaIndexacao'].sort());
  });

  it('registrarTentativaIndexacao ignora qualquer valor de "resultado" além de INDEXADO e sempre normaliza para FALHA_TECNICA — não existe via de exclusão por relevância', () => {
    const indice = criarIndice();

    // "EXCLUIDO_POR_RELEVANCIA" simula uma tentativa de forçar um motivo de
    // negócio (relevância) via `resultado`. O agregado nem valida nem
    // preserva esse valor: qualquer coisa diferente de 'INDEXADO' colapsa
    // em FALHA_TECNICA (ver `registrarTentativaIndexacao`), então não há
    // como um chamador registrar "excluído por relevância" como outcome —
    // só INDEXADO (com embedding) ou FALHA_TECNICA (com motivoFalha).
    indice.registrarTentativaIndexacao({
      resultado: 'EXCLUIDO_POR_RELEVANCIA',
      timestamp,
      motivoFalha: 'tentativa de exclusão por relevância de negócio',
    } as never);

    expect(indice.estado).toBe('FALHA_INDEXACAO');
    expect(indice.historico).toHaveLength(1);
    expect(indice.historico[0]?.resultado).toBe('FALHA_TECNICA');
  });

  it('registrarTentativaIndexacao rejeita FALHA_TECNICA sem motivoFalha — nenhuma omissão silenciosa, mesmo com resultado de negócio forjado', () => {
    const indice = criarIndice();

    expect(() =>
      indice.registrarTentativaIndexacao({
        resultado: 'EXCLUIDO_POR_RELEVANCIA',
        timestamp,
      } as never),
    ).toThrow(TentativaIndexacaoInvalidaError);

    expect(indice.estado).toBe('PENDENTE');
    expect(indice.historico).toHaveLength(0);
  });
});

type TentativaIndexacaoArrayMutavel = unknown[];
