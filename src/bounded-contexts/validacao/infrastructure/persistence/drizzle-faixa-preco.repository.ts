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
 * Implementa `ParametroFaixaPrecoGateway` (T023) — leitura da tabela de
 * configuração operacional `faixas_preco_categoria` via Drizzle (ADR-001
 * herdado). Escrita (`upsert`, US3/T043) é responsabilidade adicional deste
 * mesmo componente, fora do escopo desta task (YAGNI até US3 exigir).
 */
export class DrizzleFaixaPrecoRepository implements ParametroFaixaPrecoGateway {
  constructor(private readonly db: NodePgDatabase) {}

  async listarTodas(): Promise<readonly FaixaPreco[]> {
    const linhas = await this.db.select().from(faixasPrecoCategoria);
    return linhas.map(faixaPrecoDaLinha);
  }
}
