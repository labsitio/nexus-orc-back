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
  construir: (valor: TBruto) => TVo | undefined,
): CampoExtraido<TVo> {
  const confianca = NivelConfianca.de(campo.confianca);
  if (campo.valor === null || !confianca.atingeLimiar(LIMIAR_CONFIANCA_CAMPO_EXTRAIDO)) {
    // Confiança insuficiente ou o próprio modelo reportou ausência — nunca
    // inventa/estima valor (spec.md, Ação proibida crítica).
    return CampoExtraido.naoExtraido(confianca, 'EXTRATOR');
  }
  const valorConstruido = construir(campo.valor);
  if (valorConstruido === undefined) {
    // Construtor não conseguiu resolver o valor de forma determinística (ex.:
    // prazoValidade sem data absoluta nem período relativo reconhecido,
    // ADR-015) — residual, mesmo efeito de "não extraído" no domínio.
    return CampoExtraido.naoExtraido(confianca, 'EXTRATOR');
  }
  return CampoExtraido.extraido(valorConstruido, confianca, 'EXTRATOR');
}

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}/;
const REGEX_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const REGEX_PERIODO_RELATIVO = /(\d+)\s*(dias?|semanas?|mes(?:es)?|mês(?:es)?|anos?)/i;

const UNIDADES_PERIODO_RELATIVO: Readonly<Record<string, 'dia' | 'semana' | 'mes' | 'ano'>> = {
  dia: 'dia',
  dias: 'dia',
  semana: 'semana',
  semanas: 'semana',
  mes: 'mes',
  meses: 'mes',
  mês: 'mes',
  mêses: 'mes',
  ano: 'ano',
  anos: 'ano',
};

/**
 * `art. 132 §3` do Código Civil: "Os prazos de meses e anos expiram no dia de
 * igual número do do início, ou no imediato, se faltar exata
 * correspondência." Mesmo dia-número no mês destino; se aquele dia não existe
 * lá, o dia imediato — o primeiro dia do mês seguinte. NUNCA troque por
 * `setMonth` puro: o overflow nativo do JS dá resultado diferente da lei nos
 * fins de mês (ex.: 31/01 + 1 mês = 01/03 pela lei, 03/03 por `setMonth`).
 */
function somarMeses(inicio: Date, meses: number): Date {
  const dia = inicio.getUTCDate();
  const y = inicio.getUTCFullYear();
  const m = inicio.getUTCMonth() + meses;
  const ultimoDiaDestino = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return dia <= ultimoDiaDestino ? new Date(Date.UTC(y, m, dia)) : new Date(Date.UTC(y, m + 1, 1));
}

/**
 * Caminho 1 (data absoluta). Aceita apenas ISO (`^\d{4}-\d{2}-\d{2}`) ou
 * `dd/mm/yyyy` parseado explicitamente por regex — NUNCA `new Date(string)`
 * cru para formato não-ISO: `new Date('05/09/2026')` devolve 9 de maio (o
 * runtime interpreta mês/dia), gravando data errada e plausível em silêncio.
 */
function resolverDataAbsoluta(texto: string): Date | undefined {
  const textoLimpo = texto.trim();

  if (REGEX_DATA_ISO.test(textoLimpo)) {
    const data = new Date(textoLimpo);
    return Number.isNaN(data.getTime()) ? undefined : data;
  }

  const matchBr = REGEX_DATA_BR.exec(textoLimpo);
  if (!matchBr) return undefined;
  const [, diaStr, mesStr, anoStr] = matchBr;
  const dia = Number(diaStr);
  const mes = Number(mesStr);
  const ano = Number(anoStr);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const dataValida =
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return dataValida ? data : undefined;
}

/** Caminho 2 (período relativo). Dias/semanas: soma simples (`art. 132 caput`). Meses/anos: `somarMeses`. */
function resolverPeriodoRelativo(texto: string, referencia: Date): Date | undefined {
  const match = REGEX_PERIODO_RELATIVO.exec(texto.toLowerCase());
  if (!match) return undefined;
  const quantidade = Number(match[1]);
  const unidade = UNIDADES_PERIODO_RELATIVO[match[2]!];
  if (unidade === undefined || Number.isNaN(quantidade)) return undefined;

  const UM_DIA_MS = 24 * 60 * 60 * 1000;
  switch (unidade) {
    case 'dia':
      return new Date(referencia.getTime() + quantidade * UM_DIA_MS);
    case 'semana':
      return new Date(referencia.getTime() + quantidade * 7 * UM_DIA_MS);
    case 'mes':
      return somarMeses(referencia, quantidade);
    case 'ano':
      return somarMeses(referencia, quantidade * 12);
  }
}

/**
 * ADR-015: resolução determinística de `prazoValidade` na ACL — o LLM só lê
 * texto livre, nunca calcula data (aritmética de data é proibida ao modelo
 * pela spec.md). Três caminhos, nessa ordem: data absoluta, período relativo
 * (dia/semana/mês/ano) e residual (`undefined`, traduzido em `naoExtraido`).
 */
export function resolverPrazoValidade(
  texto: string,
  referencia: Date,
): PeriodoValidade | undefined {
  const dataAbsoluta = resolverDataAbsoluta(texto);
  if (dataAbsoluta !== undefined) return PeriodoValidade.de(dataAbsoluta);

  const dataRelativa = resolverPeriodoRelativo(texto, referencia);
  if (dataRelativa !== undefined) return PeriodoValidade.de(dataRelativa);

  return undefined;
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
        resolverPrazoValidade(v, new Date()),
      ),
      condicoesEntrega: paraCampoExtraido(bruto.condicoesComerciais.condicoesEntrega, (v) => v),
    });

    return { itens, condicoesComerciais };
  }
}
