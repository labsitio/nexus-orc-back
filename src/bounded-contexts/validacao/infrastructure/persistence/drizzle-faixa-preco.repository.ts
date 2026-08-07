import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ParametroFaixaPrecoGateway } from '../../domain/gateways/parametro-faixa-preco.gateway.js';
import { CategoriaItem } from '../../domain/value-objects/categoria-item.vo.js';
import { Dinheiro } from '../../domain/value-objects/dinheiro.vo.js';
import { FaixaPreco } from '../../domain/value-objects/faixa-preco.vo.js';
import { faixasPrecoCategoria } from './schema/validacao-orcamento.schema.js';

/** Linha de `faixas_preco_categoria` — nunca cruza para fora deste arquivo. */
type LinhaFaixaPrecoCategoria = typeof faixasPrecoCategoria.$inferSelect;

function faixaPrecoDaLinha(linha: LinhaFaixaPrecoCategoria): FaixaPreco {
  return FaixaPreco.de(
    CategoriaItem.de(linha.categoria),
    Dinheiro.de(linha.precoMinimoCentavos, linha.moeda),
    Dinheiro.de(linha.precoMaximoCentavos, linha.moeda),
  );
}

/**
 * Implementa `ParametroFaixaPrecoGateway` (T023/T043) — leitura e escrita da
 * tabela de configuração operacional `faixas_preco_categoria` via Drizzle
 * (ADR-001 herdado). Catálogo global compartilhado, não tenant-scoped — ver
 * nota em `parametro-faixa-preco.gateway.ts` sobre por que este repositório
 * não estende `DrizzleTenantScopedRepositoryBase` (retrofit 007 escopa
 * tenant-scoping a dado de orçamento, não a este parâmetro de configuração).
 */
export class DrizzleFaixaPrecoRepository implements ParametroFaixaPrecoGateway {
  constructor(private readonly db: NodePgDatabase) {}

  async listarTodas(): Promise<readonly FaixaPreco[]> {
    const linhas = await this.db.select().from(faixasPrecoCategoria);
    return linhas.map(faixaPrecoDaLinha);
  }

  /**
   * Upsert por `categoria` — chave de conflito é a própria PK da tabela
   * (`faixasPrecoCategoria.categoria`), nunca uma chave sintética: duas
   * escritas para a mesma categoria devem atualizar a mesma linha, nunca
   * inserir duplicata (contrato T038/T044 — última configuração ganha).
   */
  async upsert(faixaPreco: FaixaPreco): Promise<void> {
    const precoMinimo = faixaPreco.precoMinimo.paraPayload();
    const precoMaximo = faixaPreco.precoMaximo.paraPayload();

    await this.db
      .insert(faixasPrecoCategoria)
      .values({
        categoria: faixaPreco.categoria.valor,
        precoMinimoCentavos: precoMinimo.valorCentavos,
        precoMaximoCentavos: precoMaximo.valorCentavos,
        moeda: precoMinimo.moeda,
      })
      .onConflictDoUpdate({
        target: faixasPrecoCategoria.categoria,
        set: {
          precoMinimoCentavos: precoMinimo.valorCentavos,
          precoMaximoCentavos: precoMaximo.valorCentavos,
          moeda: precoMinimo.moeda,
        },
      });
  }
}
