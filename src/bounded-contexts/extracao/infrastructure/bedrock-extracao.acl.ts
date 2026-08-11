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

/**
 * Valida o shape de um `CampoBruto<T>`: `confianca` numérica e `valor` nulo
 * (contrato de "não extraído") ou aprovado por `validarValor`. Nunca rejeita
 * `null` — é dado legítimo do contrato, só shape errado é defeito (ADR-014).
 */
function ehCampoBruto(campo: unknown, validarValor: (valor: unknown) => boolean): boolean {
  if (typeof campo !== 'object' || campo === null) return false;
  const registro = campo as Record<string, unknown>;
  if (typeof registro.confianca !== 'number') return false;
  return registro.valor === null || validarValor(registro.valor);
}

function ehDescricaoValor(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro.descricao === 'string' &&
    (registro.sku === undefined || typeof registro.sku === 'string')
  );
}

function ehPrecoUnitarioValor(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return typeof registro.valorCentavos === 'number' && typeof registro.moeda === 'string';
}

function ehItemOrcamentoBruto(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const registro = item as Record<string, unknown>;
  return (
    ehCampoBruto(registro.descricao, ehDescricaoValor) &&
    ehCampoBruto(registro.quantidade, (v) => typeof v === 'number') &&
    ehCampoBruto(registro.precoUnitario, ehPrecoUnitarioValor)
  );
}

function ehCondicoesComerciaisBruto(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  const ehTexto = (v: unknown) => typeof v === 'string';
  return (
    ehCampoBruto(registro.condicoesPagamento, ehTexto) &&
    ehCampoBruto(registro.prazoValidade, ehTexto) &&
    ehCampoBruto(registro.condicoesEntrega, ehTexto)
  );
}

/**
 * Type guard estrutural — nunca confia cegamente no shape reportado pelo
 * LLM. Valida também o `CampoBruto` aninhado de cada campo (ADR-014): shape
 * inválido (ex.: `descricao.valor` string em vez de objeto) é rejeitado
 * aqui, antes de chegar a qualquer Value Object de domínio.
 */
export function ehExtracaoBruta(valor: unknown): valor is ExtracaoBruta {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    Array.isArray(registro.itens) &&
    registro.itens.every(ehItemOrcamentoBruto) &&
    ehCondicoesComerciaisBruto(registro.condicoesComerciais)
  );
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
 * Variantes de notação de moeda conhecidas — normalização explícita e
 * enumerada (camada 2 do ADR-014), nunca heurística. Variante fora deste
 * mapa segue para a camada 3 (`Dinheiro.de`) e é rejeitada, nunca
 * "adivinhada".
 */
const VARIANTES_MOEDA_CONHECIDAS: Readonly<Record<string, string>> = {
  R$: 'BRL',
};

function normalizarMoeda(moeda: string): string {
  return VARIANTES_MOEDA_CONHECIDAS[moeda] ?? moeda;
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
    if (!ehExtracaoBruta(bruto)) {
      throw new BedrockExtracaoACLInvalidaError(
        'CampoBruto aninhado com shape inválido (ver ADR-014)',
      );
    }
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
          Dinheiro.de(v.valorCentavos, normalizarMoeda(v.moeda)),
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
