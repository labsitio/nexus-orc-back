import { TenantId } from '../../../shared-kernel/tenant/tenant-id.vo.js';
import { OrcamentoExtraidoEventACLInvalidoError } from '../domain/errors/evento-upstream-acl.errors.js';
import type {
  OrcamentoExtraidoEventACL as OrcamentoExtraidoEventACLPort,
  OrcamentoExtraidoEventACLResultado,
} from '../domain/gateways/orcamento-extraido-event.acl.js';
import { ContextoExtracao } from '../domain/value-objects/contexto-extracao.vo.js';
import { OrcamentoId } from '../domain/value-objects/orcamento-id.vo.js';

const DETAIL_TYPES_ORCAMENTO_EXTRAIDO = [
  'OrcamentoExtraido',
  'OrcamentoExtraidoComPendenciaConfirmada',
] as const;
type DetailTypeOrcamentoExtraido = (typeof DETAIL_TYPES_ORCAMENTO_EXTRAIDO)[number];

/** `CampoExtraido<T>` bruto (spec 002) — só o suficiente para montar o resumo. */
interface CampoExtraidoBruto<T> {
  readonly valor: T | null;
}

interface ItemOrcamentoBruto {
  readonly descricao: CampoExtraidoBruto<{ readonly descricao: string }>;
  readonly quantidade: CampoExtraidoBruto<number>;
  readonly precoUnitario: CampoExtraidoBruto<{
    readonly valorCentavos: number;
    readonly moeda: string;
  }>;
}

interface CondicoesComerciaisBruto {
  readonly condicoesPagamento: CampoExtraidoBruto<string>;
  readonly prazoValidade: CampoExtraidoBruto<string>;
  readonly condicoesEntrega: CampoExtraidoBruto<string>;
}

/**
 * Shape mínimo do payload bruto dos eventos `OrcamentoExtraido`/
 * `OrcamentoExtraidoComPendenciaConfirmada` (`source: nexo.extracao`, spec 002)
 * relevante a este BC — contrato JSON local, não tipo de domínio importado
 * do BC Extração (fronteira de Bounded Context).
 */
interface OrcamentoExtraidoPayloadBruto {
  readonly orcamentoId: string;
  readonly detailType: DetailTypeOrcamentoExtraido;
  readonly itens: readonly ItemOrcamentoBruto[];
  readonly condicoesComerciais: CondicoesComerciaisBruto;
  /**
   * (spec 007, ADR-008 — cutover de contract, #632) Obrigatório desde
   * `schemaVersion: 2` do envelope de origem (spec 002) — o type guard
   * estrutural (`ehOrcamentoExtraidoPayloadBruto`) já rejeita ausente.
   */
  readonly tenantId: string;
}

/**
 * Valida `{ valor }`, aceitando `valor: null` (campo não extraído) ou
 * `valor` validado por `ehValorNaoNulo` — nunca só a presença da chave
 * `valor`: um `valor` não-nulo com shape interno malformado (ex.:
 * `precoUnitario.valor = {}`) precisa reprovar aqui, não vazar para
 * `formatarItem`/`formatarCondicoesComerciais` como resumo corrompido
 * silencioso (achado do `backend-reviewer`, PR #558).
 */
function ehCampoExtraidoBruto<T>(
  valor: unknown,
  ehValorNaoNulo: (valor: unknown) => valor is T,
): valor is CampoExtraidoBruto<T> {
  if (typeof valor !== 'object' || valor === null || !('valor' in valor)) {
    return false;
  }
  const bruto = (valor as Record<string, unknown>).valor;
  return bruto === null || ehValorNaoNulo(bruto);
}

function ehString(valor: unknown): valor is string {
  return typeof valor === 'string';
}

function ehDescricaoProdutoBruta(valor: unknown): valor is { readonly descricao: string } {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as Record<string, unknown>).descricao === 'string'
  );
}

function ehDinheiroBruto(
  valor: unknown,
): valor is { readonly valorCentavos: number; readonly moeda: string } {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const objeto = valor as Record<string, unknown>;
  return typeof objeto.valorCentavos === 'number' && typeof objeto.moeda === 'string';
}

function ehItemOrcamentoBruto(valor: unknown): valor is ItemOrcamentoBruto {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const objeto = valor as Record<string, unknown>;
  return (
    ehCampoExtraidoBruto(objeto.descricao, ehDescricaoProdutoBruta) &&
    ehCampoExtraidoBruto(objeto.quantidade, (v): v is number => typeof v === 'number') &&
    ehCampoExtraidoBruto(objeto.precoUnitario, ehDinheiroBruto)
  );
}

function ehCondicoesComerciaisBruto(valor: unknown): valor is CondicoesComerciaisBruto {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const objeto = valor as Record<string, unknown>;
  return (
    ehCampoExtraidoBruto(objeto.condicoesPagamento, ehString) &&
    ehCampoExtraidoBruto(objeto.prazoValidade, ehString) &&
    ehCampoExtraidoBruto(objeto.condicoesEntrega, ehString)
  );
}

function ehOrcamentoExtraidoPayloadBruto(valor: unknown): valor is OrcamentoExtraidoPayloadBruto {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const objeto = valor as Record<string, unknown>;
  return (
    typeof objeto.orcamentoId === 'string' &&
    typeof objeto.detailType === 'string' &&
    (DETAIL_TYPES_ORCAMENTO_EXTRAIDO as readonly string[]).includes(objeto.detailType) &&
    Array.isArray(objeto.itens) &&
    objeto.itens.every(ehItemOrcamentoBruto) &&
    ehCondicoesComerciaisBruto(objeto.condicoesComerciais) &&
    typeof objeto.tenantId === 'string'
  );
}

/** `null` (campo não extraído) formatado como texto legível — nunca omitido do resumo. */
function textoOuNaoInformado<T>(valor: T | null, formatar: (valor: T) => string): string {
  return valor === null ? 'não informado' : formatar(valor);
}

function formatarItem(item: ItemOrcamentoBruto): string {
  const descricao = textoOuNaoInformado(item.descricao.valor, (v) => v.descricao);
  const quantidade = textoOuNaoInformado(item.quantidade.valor, (v) => String(v));
  const precoUnitario = textoOuNaoInformado(
    item.precoUnitario.valor,
    (v) => `${(v.valorCentavos / 100).toFixed(2)} ${v.moeda}`,
  );
  return `${descricao} (qtd: ${quantidade}, preço unit.: ${precoUnitario})`;
}

function formatarCondicoesComerciais(condicoes: CondicoesComerciaisBruto): string {
  const pagamento = textoOuNaoInformado(condicoes.condicoesPagamento.valor, (v) => v);
  const prazoValidade = textoOuNaoInformado(condicoes.prazoValidade.valor, (v) => v);
  const entrega = textoOuNaoInformado(condicoes.condicoesEntrega.valor, (v) => v);
  return `pagamento: ${pagamento}; validade: ${prazoValidade}; entrega: ${entrega}`;
}

/**
 * Anti-Corruption Layer entre o Domain deste BC e o payload bruto dos
 * eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (T017) — traduz para `ContextoExtracao`, nunca importando tipos de
 * domínio do BC Extração. `itensResumo`/`condicoesComerciaisResumo` são
 * resumo textual construído aqui a partir dos itens/condições completos —
 * contrato exato do resumo é risco remanescente registrado em
 * `plan.md`/T056, não uma garantia de estabilidade externa. `payloadBruto`
 * é entrada não confiável, possivelmente derivada de documento de
 * fornecedor: qualquer desvio do contrato mínimo lança
 * `OrcamentoExtraidoEventACLInvalidoError` (Domain).
 */
export class OrcamentoExtraidoEventACL implements OrcamentoExtraidoEventACLPort {
  traduzir(payloadBruto: unknown): OrcamentoExtraidoEventACLResultado {
    if (!ehOrcamentoExtraidoPayloadBruto(payloadBruto)) {
      throw new OrcamentoExtraidoEventACLInvalidoError(
        'esperado objeto com "orcamentoId" (string), "detailType" ("OrcamentoExtraido"|"OrcamentoExtraidoComPendenciaConfirmada"), "itens" (array) e "condicoesComerciais" (objeto) no contrato de campos extraídos',
      );
    }
    return {
      orcamentoId: OrcamentoId.de(payloadBruto.orcamentoId),
      contextoExtracao: ContextoExtracao.de({
        itensResumo: payloadBruto.itens.map(formatarItem).join('; '),
        condicoesComerciaisResumo: formatarCondicoesComerciais(payloadBruto.condicoesComerciais),
        houvePendenciaConfirmada:
          payloadBruto.detailType === 'OrcamentoExtraidoComPendenciaConfirmada',
      }),
      tenantId: TenantId.de(payloadBruto.tenantId),
    };
  }
}
