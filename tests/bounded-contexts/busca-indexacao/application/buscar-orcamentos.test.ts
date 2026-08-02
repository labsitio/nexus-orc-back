import { describe, expect, it } from 'vitest';
import {
  BuscarOrcamentos,
  BuscarOrcamentosInvalidoError,
  type BuscarOrcamentosInput,
} from '../../../../src/bounded-contexts/busca-indexacao/application/use-cases/buscar-orcamentos.js';
import type { AgenteInterpretadorConsultaGateway } from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/agente-interpretador-consulta.gateway.js';
import type { AgenteEmbeddingGateway } from '../../../../src/bounded-contexts/busca-indexacao/domain/gateways/agente-embedding.gateway.js';
import type { IndiceOrcamentoRepository } from '../../../../src/bounded-contexts/busca-indexacao/domain/repositories/indice-orcamento.repository.js';
import { CriterioBusca } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/criterio-busca.vo.js';
import { Dinheiro } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/dinheiro.vo.js';
import { Embedding } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/embedding.vo.js';
import { OrcamentoId } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/orcamento-id.vo.js';
import { ResultadoBusca } from '../../../../src/bounded-contexts/busca-indexacao/domain/value-objects/resultado-busca.vo.js';
import { TenantId } from '../../../../src/shared-kernel/tenant/tenant-id.vo.js';

/**
 * T034 (#194) — Unit test do caso de uso `BuscarOrcamentos`: filtro explícito
 * enviado na requisição nunca é sobrescrito pela interpretação da IA, apenas
 * complementado (mock de `AgenteInterpretadorConsultaGateway` e
 * `AgenteEmbeddingGateway`); `tenantId` sempre presente e nunca
 * sobrescrevível por parâmetro de busca.
 */

const CATALOGO_CATEGORIAS = ['ferragens', 'eletrica'] as const;
const TENANT_ID = TenantId.de('018f5b3a-9999-7abc-89ab-0123456789ab');

class InterpretadorConsultaFake implements AgenteInterpretadorConsultaGateway {
  chamadas: unknown[] = [];
  constructor(private readonly resultado: CriterioBusca) {}

  async interpretar(input: {
    consultaLinguagemNatural: string;
    catalogoCategorias: readonly string[];
  }): Promise<CriterioBusca> {
    this.chamadas.push(input);
    return this.resultado;
  }
}

class EmbeddingGatewayFake implements AgenteEmbeddingGateway {
  chamadas: string[] = [];
  constructor(private readonly embedding: Embedding) {}

  async gerarEmbedding(texto: string): Promise<Embedding> {
    this.chamadas.push(texto);
    return this.embedding;
  }
}

class IndiceOrcamentoRepositoryFake implements IndiceOrcamentoRepository {
  chamadasBusca: {
    criterio: CriterioBusca;
    vetorConsulta: Embedding | undefined;
    limite: number;
  }[] = [];

  async upsert(): Promise<void> {
    throw new Error('BuscarOrcamentos nunca escreve — upsert não deveria ser chamado');
  }

  async buscarPorOrcamentoId(): Promise<undefined> {
    return undefined;
  }

  async buscarPorCriterioEVetor(
    criterio: CriterioBusca,
    vetorConsulta: Embedding | undefined,
    limite: number,
  ): Promise<readonly ResultadoBusca[]> {
    this.chamadasBusca.push({ criterio, vetorConsulta, limite });
    return [
      ResultadoBusca.de({
        orcamentoId: OrcamentoId.de('018f5b3a-1111-7abc-89ab-0123456789ab'),
        scoreRelevancia: 0.9,
      }),
    ];
  }
}

function embeddingFixture(): Embedding {
  return Embedding.de({
    vetor: new Array(4).fill(0.1),
    dimensao: 4,
    modeloId: 'amazon.titan-embed-text-v2:0',
    geradoEm: new Date('2026-01-10T00:00:00.000Z'),
  });
}

function montarCaso(interpretado: CriterioBusca) {
  const interpretador = new InterpretadorConsultaFake(interpretado);
  const embeddingGateway = new EmbeddingGatewayFake(embeddingFixture());
  const repositorio = new IndiceOrcamentoRepositoryFake();
  const useCase = new BuscarOrcamentos(
    interpretador,
    embeddingGateway,
    repositorio,
    CATALOGO_CATEGORIAS,
  );
  return { interpretador, embeddingGateway, repositorio, useCase };
}

describe('BuscarOrcamentos', () => {
  it('nunca sobrescreve filtro explícito de categoria com a interpretação da IA', async () => {
    const interpretado = CriterioBusca.de({
      categoria: 'eletrica',
      textoLivreResidual: 'parafuso sextavado',
    });
    const { repositorio, useCase } = montarCaso(interpretado);

    const input: BuscarOrcamentosInput = {
      consultaLinguagemNatural: 'parafuso sextavado categoria ferragens',
      filtrosExplicitos: { categoria: 'ferragens' },
    };

    await useCase.executar(TENANT_ID, input);

    expect(repositorio.chamadasBusca).toHaveLength(1);
    expect(repositorio.chamadasBusca[0]!.criterio.categoria).toBe('ferragens');
  });

  it('complementa com a categoria interpretada pela IA quando o filtro explícito não a informa', async () => {
    const interpretado = CriterioBusca.de({
      categoria: 'eletrica',
      textoLivreResidual: 'fio 2.5mm',
    });
    const { repositorio, useCase } = montarCaso(interpretado);

    await useCase.executar(TENANT_ID, { consultaLinguagemNatural: 'fio 2.5mm' });

    expect(repositorio.chamadasBusca[0]!.criterio.categoria).toBe('eletrica');
  });

  it('nunca sobrescreve precoMinimo/precoMaximo/periodoRecebimento explícitos com a interpretação da IA', async () => {
    const precoMinimoExplicito = Dinheiro.de(1000, 'BRL');
    const precoMaximoExplicito = Dinheiro.de(5000, 'BRL');
    const periodoExplicito = {
      inicio: new Date('2026-01-01T00:00:00.000Z'),
      fim: new Date('2026-01-31T00:00:00.000Z'),
    };
    const interpretado = CriterioBusca.de({
      precoMinimo: Dinheiro.de(1, 'BRL'),
      precoMaximo: Dinheiro.de(2, 'BRL'),
      periodoRecebimento: {
        inicio: new Date('2020-01-01T00:00:00.000Z'),
        fim: new Date('2020-01-02T00:00:00.000Z'),
      },
      textoLivreResidual: '',
    });
    const { repositorio, useCase } = montarCaso(interpretado);

    await useCase.executar(TENANT_ID, {
      consultaLinguagemNatural: 'qualquer coisa',
      filtrosExplicitos: {
        precoMinimo: precoMinimoExplicito,
        precoMaximo: precoMaximoExplicito,
        periodoRecebimento: periodoExplicito,
      },
    });

    const criterioFinal = repositorio.chamadasBusca[0]!.criterio;
    expect(criterioFinal.precoMinimo?.equals(precoMinimoExplicito)).toBe(true);
    expect(criterioFinal.precoMaximo?.equals(precoMaximoExplicito)).toBe(true);
    expect(criterioFinal.periodoRecebimento?.inicio).toEqual(periodoExplicito.inicio);
    expect(criterioFinal.periodoRecebimento?.fim).toEqual(periodoExplicito.fim);
  });

  it('gera vetor de consulta a partir do textoLivreResidual retornado pela interpretação', async () => {
    const interpretado = CriterioBusca.de({ textoLivreResidual: 'caixa de papelão' });
    const { embeddingGateway, repositorio, useCase } = montarCaso(interpretado);

    await useCase.executar(TENANT_ID, { consultaLinguagemNatural: 'caixa de papelão' });

    expect(embeddingGateway.chamadas).toEqual(['caixa de papelão']);
    expect(repositorio.chamadasBusca[0]!.vetorConsulta).toBeDefined();
  });

  it('não gera vetor de consulta quando o textoLivreResidual está vazio (filtros explícitos bastam)', async () => {
    const interpretado = CriterioBusca.de({ categoria: 'ferragens', textoLivreResidual: '' });
    const { embeddingGateway, repositorio, useCase } = montarCaso(interpretado);

    await useCase.executar(TENANT_ID, { consultaLinguagemNatural: 'categoria ferragens' });

    expect(embeddingGateway.chamadas).toHaveLength(0);
    expect(repositorio.chamadasBusca[0]!.vetorConsulta).toBeUndefined();
  });

  it('exige tenantId — lança erro de domínio quando ausente, mesmo contornando o tipo em runtime', async () => {
    const interpretado = CriterioBusca.de({ textoLivreResidual: '' });
    const { useCase } = montarCaso(interpretado);

    await expect(
      useCase.executar(undefined as never, { consultaLinguagemNatural: '' }),
    ).rejects.toThrow(BuscarOrcamentosInvalidoError);
  });

  it('ignora tentativa de sobrescrever tenantId via filtrosExplicitos — o tipo do input não expõe esse campo, e o resultado é idêntico ao mesmo caso sem a tentativa', async () => {
    const interpretado = CriterioBusca.de({ categoria: 'ferragens', textoLivreResidual: '' });

    const casoLimpo = montarCaso(interpretado);
    await casoLimpo.useCase.executar(TENANT_ID, {
      consultaLinguagemNatural: 'consulta',
      filtrosExplicitos: { categoria: 'ferragens' },
    });

    const casoComTentativaDeSobrescrita = montarCaso(interpretado);
    const filtrosComTenantIdForjado = {
      categoria: 'ferragens',
      tenantId: '018f5b3a-0000-7abc-89ab-0123456789ab',
    } as unknown as BuscarOrcamentosInput['filtrosExplicitos'];
    await casoComTentativaDeSobrescrita.useCase.executar(TENANT_ID, {
      consultaLinguagemNatural: 'consulta',
      filtrosExplicitos: filtrosComTenantIdForjado,
    });

    expect(casoComTentativaDeSobrescrita.repositorio.chamadasBusca[0]!.criterio.categoria).toBe(
      casoLimpo.repositorio.chamadasBusca[0]!.criterio.categoria,
    );
  });

  it('nunca escreve — não invoca upsert do repositório', async () => {
    const interpretado = CriterioBusca.de({ textoLivreResidual: '' });
    const { repositorio, useCase } = montarCaso(interpretado);

    await useCase.executar(TENANT_ID, { consultaLinguagemNatural: '' });

    expect(repositorio.chamadasBusca).toHaveLength(1);
  });
});
