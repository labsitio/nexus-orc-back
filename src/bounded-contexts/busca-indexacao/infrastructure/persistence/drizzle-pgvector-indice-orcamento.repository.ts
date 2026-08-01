import { and, asc, cosineDistance, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  IndiceOrcamento,
  IndiceOrcamentoInconsistenteError,
  type EstadoIndexacao,
  type IndiceOrcamentoReconstituirProps,
} from '../../domain/aggregates/indice-orcamento.aggregate.js';
import type { IndiceOrcamentoRepository } from '../../domain/repositories/indice-orcamento.repository.js';
import { ConteudoIndexavel } from '../../domain/value-objects/conteudo-indexavel.vo.js';
import { CriterioBusca } from '../../domain/value-objects/criterio-busca.vo.js';
import { Embedding } from '../../domain/value-objects/embedding.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../../domain/value-objects/origem-validacao.vo.js';
import { ResultadoBusca } from '../../domain/value-objects/resultado-busca.vo.js';
import { TentativaIndexacao } from '../../domain/value-objects/tentativa-indexacao.vo.js';
import { indicesOrcamento, indicesOrcamentoHistorico } from './schema/indice-orcamento.schema.js';

/** Linha de `indices_orcamento`/histórico — nunca cruza para fora deste arquivo (T014). */
type LinhaIndiceOrcamento = typeof indicesOrcamento.$inferSelect;
type LinhaHistorico = typeof indicesOrcamentoHistorico.$inferSelect;

/** Shape JSONB persistido em `conteudo_indexavel` — espelha `ConteudoIndexavelProps`. */
interface ConteudoIndexavelPayload {
  readonly resumoFornecedor: string;
  readonly itensDescricao: readonly string[];
  readonly condicoesResumo: string;
  readonly categorias: readonly string[];
}

function conteudoIndexavelDaLinha(linha: LinhaIndiceOrcamento): ConteudoIndexavel {
  const payload = linha.conteudoIndexavel as ConteudoIndexavelPayload;
  return ConteudoIndexavel.de(payload);
}

function tentativaDaLinha(linha: LinhaHistorico): TentativaIndexacao {
  return TentativaIndexacao.de({
    resultado: linha.resultado as 'INDEXADO' | 'FALHA_TECNICA',
    timestamp: linha.ocorreuEm,
    ...(linha.modeloEmbedding !== null ? { modeloEmbedding: linha.modeloEmbedding } : {}),
    ...(linha.motivoFalha !== null ? { motivoFalha: linha.motivoFalha } : {}),
  });
}

/**
 * Reconstrói o `Embedding` persistido a partir do vetor bruto da linha +
 * `modeloId`/`geradoEm`, que não têm coluna própria em `indices_orcamento`
 * (só o vetor tem) — vêm da última `TentativaIndexacao` com resultado
 * `INDEXADO` do histórico, que é sempre a que produziu o estado atual
 * (invariante do agregado: só existe `embedding` na linha quando essa
 * tentativa foi registrada).
 */
function embeddingDaLinha(
  linha: LinhaIndiceOrcamento,
  historico: readonly TentativaIndexacao[],
): Embedding | undefined {
  if (!linha.embedding) {
    return undefined;
  }

  const ultimaTentativaIndexado = [...historico]
    .reverse()
    .find((tentativa) => tentativa.resultado === 'INDEXADO');
  if (!ultimaTentativaIndexado?.modeloEmbedding) {
    throw new IndiceOrcamentoInconsistenteError(
      'linha com embedding persistido mas sem TentativaIndexacao INDEXADO correspondente no histórico',
    );
  }

  return Embedding.de({
    vetor: linha.embedding,
    dimensao: linha.embedding.length,
    modeloId: ultimaTentativaIndexado.modeloEmbedding,
    geradoEm: ultimaTentativaIndexado.timestamp,
  });
}

function agregadoDaLinha(
  linha: LinhaIndiceOrcamento,
  historico: readonly TentativaIndexacao[],
): IndiceOrcamento {
  const props: IndiceOrcamentoReconstituirProps = {
    orcamentoId: OrcamentoId.de(linha.id),
    conteudoIndexavel: conteudoIndexavelDaLinha(linha),
    origemValidacao: OrigemValidacao.de(linha.origemValidacao),
    estado: linha.estado as EstadoIndexacao,
    embedding: embeddingDaLinha(linha, historico),
    historico,
  };
  return IndiceOrcamento.reconstituir(props);
}

/** Normaliza distância cosseno pgvector (`[0, 2]`) para score de relevância `[0, 1]` (plan.md). */
function scoreDeDistancia(distancia: number): number {
  const score = 1 - distancia / 2;
  return Math.min(1, Math.max(0, score));
}

/**
 * Implementa `IndiceOrcamentoRepository` sobre Aurora Serverless v2 Postgres
 * + extensão `pgvector` via Drizzle (ADR-001, plan.md). Traduz linha↔agregado
 * — nenhum tipo de linha nem o payload JSONB bruto de `conteudo_indexavel`
 * escapa deste arquivo; o tipo `vector` (`number[]` mapeado pelo Drizzle)
 * nunca vaza para fora da Infra (fica encapsulado no VO `Embedding`).
 *
 * `indices_orcamento_historico` é append-only (T015): `upsert` nunca faz
 * UPDATE/DELETE nessa tabela, apenas insere as tentativas ainda não
 * persistidas — mesmo padrão (incluindo o lock `FOR UPDATE` que serializa
 * `upsert` concorrente do mesmo agregado) de
 * `DrizzleOrcamentoValidacaoRepository` (spec 003, T014).
 *
 * `buscarPorCriterioEVetor` filtra deterministicamente apenas por `categoria`
 * (via containment JSONB em `conteudo_indexavel->categorias`, único critério
 * estruturado hoje persistido em coluna/JSONB própria) e por `estado =
 * 'INDEXADO'` (um orçamento sem embedding nunca pode ser resultado de busca
 * vetorial). `precoMinimo`/`precoMaximo`/`periodoRecebimento` de
 * `CriterioBusca` ainda NÃO são aplicados aqui: `indices_orcamento` (T015)
 * não persiste preço/período como campo estruturado/consultável — isso
 * depende do enriquecimento de payload coordenado com a spec 003 (ADR-003,
 * T006/T045, hoje bloqueado na issue #166). Registrado como risco
 * remanescente para quem implementar T037/T038 (US2): filtrar preço/período
 * em memória após a query, ou evoluir o schema, antes de expor esses filtros
 * como funcionais na API pública.
 */
export class DrizzlePgvectorIndiceOrcamentoRepository implements IndiceOrcamentoRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async upsert(indiceOrcamento: IndiceOrcamento): Promise<void> {
    const id = indiceOrcamento.orcamentoId.toString();
    const conteudoIndexavelPayload: ConteudoIndexavelPayload = {
      resumoFornecedor: indiceOrcamento.conteudoIndexavel.resumoFornecedor,
      itensDescricao: indiceOrcamento.conteudoIndexavel.itensDescricao,
      condicoesResumo: indiceOrcamento.conteudoIndexavel.condicoesResumo,
      categorias: indiceOrcamento.conteudoIndexavel.categorias,
    };
    const embeddingPersistido = indiceOrcamento.embedding
      ? [...indiceOrcamento.embedding.vetor]
      : null;

    await this.db.transaction(async (tx) => {
      // Serializa `upsert` concorrente do mesmo agregado (retry de handler
      // Lambda sobre a mesma mensagem SQS) — sem este lock, duas transações
      // poderiam ler a mesma contagem de histórico já persistida e duplicar
      // a mesma tentativa nova. Linha inexistente (1ª tentativa) não bloqueia
      // nada.
      await tx.select().from(indicesOrcamento).where(eq(indicesOrcamento.id, id)).for('update');

      await tx
        .insert(indicesOrcamento)
        .values({
          id,
          estado: indiceOrcamento.estado,
          conteudoIndexavel: conteudoIndexavelPayload,
          origemValidacao: indiceOrcamento.origemValidacao.valor,
          embedding: embeddingPersistido,
        })
        .onConflictDoUpdate({
          target: indicesOrcamento.id,
          // `conteudoIndexavel`/`origemValidacao` nunca mudam após a criação
          // (invariante do agregado — OrigemValidacaoImutavelError fora do
          // construtor), então nunca entram no SET de conflito.
          set: {
            estado: indiceOrcamento.estado,
            embedding: embeddingPersistido,
          },
        });

      const [contagem] = await tx
        .select({ jaPersistidas: sql<number>`count(*)::int` })
        .from(indicesOrcamentoHistorico)
        .where(eq(indicesOrcamentoHistorico.indiceOrcamentoId, id));

      const novasTentativas = indiceOrcamento.historico.slice(contagem?.jaPersistidas ?? 0);
      if (novasTentativas.length === 0) {
        return;
      }

      await tx.insert(indicesOrcamentoHistorico).values(
        novasTentativas.map((tentativa) => ({
          indiceOrcamentoId: id,
          resultado: tentativa.resultado,
          modeloEmbedding: tentativa.modeloEmbedding ?? null,
          motivoFalha: tentativa.motivoFalha ?? null,
          ocorreuEm: tentativa.timestamp,
        })),
      );
    });
  }

  async buscarPorOrcamentoId(orcamentoId: OrcamentoId): Promise<IndiceOrcamento | undefined> {
    const id = orcamentoId.toString();
    const [linha] = await this.db
      .select()
      .from(indicesOrcamento)
      .where(eq(indicesOrcamento.id, id));
    if (!linha) {
      return undefined;
    }

    const linhasHistorico = await this.db
      .select()
      .from(indicesOrcamentoHistorico)
      .where(eq(indicesOrcamentoHistorico.indiceOrcamentoId, id))
      .orderBy(asc(indicesOrcamentoHistorico.ocorreuEm), asc(indicesOrcamentoHistorico.id));

    return agregadoDaLinha(linha, linhasHistorico.map(tentativaDaLinha));
  }

  async buscarPorCriterioEVetor(
    criterio: CriterioBusca,
    vetorConsulta: Embedding | undefined,
    limite: number,
  ): Promise<readonly ResultadoBusca[]> {
    const condicoes = [eq(indicesOrcamento.estado, 'INDEXADO' as EstadoIndexacao)];
    if (criterio.categoria) {
      condicoes.push(
        sql`(${indicesOrcamento.conteudoIndexavel}->'categorias') @> ${JSON.stringify([criterio.categoria])}::jsonb`,
      );
    }

    // Sem vetor de consulta (`textoLivreResidual` vazio, filtros explícitos
    // bastam): nenhuma constante numérica é aceita pelo Postgres em `ORDER
    // BY` de um `SELECT` (é sempre lida como referência posicional ou erro
    // de "non-integer constant"), então a ordenação cai para `id` — resultado
    // continua determinístico, só não é ordenado por relevância semântica
    // (não há vetor para comparar). `scoreRelevancia` neutro (1) nesse caso:
    // não há distância calculada, e todo item retornado já passou no filtro
    // determinístico.
    if (!vetorConsulta) {
      const linhasSemVetor = await this.db
        .select({ id: indicesOrcamento.id })
        .from(indicesOrcamento)
        .where(and(...condicoes))
        .orderBy(asc(indicesOrcamento.id))
        .limit(limite);

      return linhasSemVetor.map((linha) =>
        ResultadoBusca.de({ orcamentoId: OrcamentoId.de(linha.id), scoreRelevancia: 1 }),
      );
    }

    const distancia = cosineDistance(indicesOrcamento.embedding, [...vetorConsulta.vetor]);

    const linhas = await this.db
      .select({ id: indicesOrcamento.id, distancia })
      .from(indicesOrcamento)
      .where(and(...condicoes))
      .orderBy(asc(distancia))
      .limit(limite);

    return linhas.map((linha) =>
      ResultadoBusca.de({
        orcamentoId: OrcamentoId.de(linha.id),
        scoreRelevancia: scoreDeDistancia(Number(linha.distancia)),
      }),
    );
  }
}
