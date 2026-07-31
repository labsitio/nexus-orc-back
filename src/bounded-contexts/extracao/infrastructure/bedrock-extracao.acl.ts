import { ErroDominio } from '../domain/errors/erro-dominio.js';
import { CampoExtraido } from '../domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../domain/value-objects/condicoes-comerciais.vo.js';
import { DescricaoProduto } from '../domain/value-objects/descricao-produto.vo.js';
import { Dinheiro } from '../domain/value-objects/dinheiro.vo.js';
import { ItemOrcamento } from '../domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../domain/value-objects/nivel-confianca.vo.js';
import { PeriodoValidade } from '../domain/value-objects/periodo-validade.vo.js';
import { Quantidade } from '../domain/value-objects/quantidade.vo.js';
import type { AgenteExtratorResultado } from '../domain/gateways/agente-extrator.gateway.js';

/**
 * Confiança mínima para um campo ser considerado extraído. spec.md (002) usa
 * a expressão "confiança suficiente" sem redefinir um número diferente do já
 * estabelecido na spec 001 (`LIMIAR_CONFIANCA = 80` em
 * `ingestao-identificacao/domain/orcamento.aggregate.ts`) — mesma convenção
 * de produto, reaplicada aqui por campo (não pelo orçamento como um todo).
 * Ajustar exige decisão do arquiteto-back/PM, não deste código.
 */
export const LIMIAR_CONFIANCA_CAMPO_EXTRAIDO = 80;

export class BedrockExtracaoACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`BedrockExtracaoACL: saída estruturada inválida — ${mensagem}`);
  }
}

interface CampoBruto<T> {
  readonly valor: T | null;
  readonly confianca: number;
}

export interface ItemOrcamentoBruto {
  readonly descricao: CampoBruto<{ descricao: string; sku?: string }>;
  readonly quantidade: CampoBruto<number>;
  readonly precoUnitario: CampoBruto<{ valorCentavos: number; moeda: string }>;
}

export interface CondicoesComerciaisBruto {
  readonly condicoesPagamento: CampoBruto<string>;
  readonly prazoValidade: CampoBruto<string>;
  readonly condicoesEntrega: CampoBruto<string>;
}

export interface ExtracaoBruta {
  readonly itens: readonly ItemOrcamentoBruto[];
  readonly condicoesComerciais: CondicoesComerciaisBruto;
}

/** Type guard estrutural — nunca confia cegamente no shape reportado pelo LLM. */
export function ehExtracaoBruta(valor: unknown): valor is ExtracaoBruta {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return Array.isArray(registro.itens) && typeof registro.condicoesComerciais === 'object';
}

function paraCampoExtraido<TBruto, TVo>(
  campo: CampoBruto<TBruto>,
  construir: (valor: TBruto) => TVo,
): CampoExtraido<TVo> {
  const confianca = NivelConfianca.de(campo.confianca);
  if (campo.valor === null || !confianca.atingeLimiar(LIMIAR_CONFIANCA_CAMPO_EXTRAIDO)) {
    // Confiança insuficiente ou o próprio modelo reportou ausência — nunca
    // inventa/estima valor (spec.md, Ação proibida crítica).
    return CampoExtraido.naoExtraido(confianca, 'EXTRATOR');
  }
  return CampoExtraido.extraido(construir(campo.valor), confianca, 'EXTRATOR');
}

/**
 * Anti-Corruption Layer que traduz a saída estruturada (tool-use) do Bedrock
 * em Value Objects do domínio, aplicando o limiar de confiança por campo.
 * Nunca repassa o JSON bruto do modelo para fora da Infrastructure — mesma
 * disciplina de `BedrockClassificadorGateway` (spec 001), mas com um passo
 * extra de tradução porque o resultado aqui é rico (itens + condições, cada
 * campo com `CampoExtraido<T>`), não um shape plano.
 */
export class BedrockExtracaoACL {
  converter(bruto: ExtracaoBruta): AgenteExtratorResultado {
    if (bruto.itens.length === 0) {
      throw new BedrockExtracaoACLInvalidaError('itens não pode ser vazio');
    }

    const itens = bruto.itens.map((item) =>
      ItemOrcamento.de({
        descricao: paraCampoExtraido(item.descricao, (v) =>
          DescricaoProduto.de(v.descricao, v.sku),
        ),
        quantidade: paraCampoExtraido(item.quantidade, (v) => Quantidade.de(v)),
        precoUnitario: paraCampoExtraido(item.precoUnitario, (v) =>
          Dinheiro.de(v.valorCentavos, v.moeda),
        ),
      }),
    );

    const condicoesComerciais = CondicoesComerciais.de({
      condicoesPagamento: paraCampoExtraido(bruto.condicoesComerciais.condicoesPagamento, (v) => v),
      prazoValidade: paraCampoExtraido(bruto.condicoesComerciais.prazoValidade, (v) =>
        PeriodoValidade.de(new Date(v)),
      ),
      condicoesEntrega: paraCampoExtraido(bruto.condicoesComerciais.condicoesEntrega, (v) => v),
    });

    return { itens, condicoesComerciais };
  }
}
