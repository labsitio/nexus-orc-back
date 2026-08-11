import { TenantId } from '../../../shared-kernel/tenant/tenant-id.vo.js';
import { OrcamentoClassificadoEventACLInvalidoError } from '../domain/errors/evento-upstream-acl.errors.js';
import type {
  OrcamentoClassificadoEventACL as OrcamentoClassificadoEventACLPort,
  OrcamentoClassificadoEventACLResultado,
} from '../domain/gateways/orcamento-classificado-event.acl.js';
import { ContextoClassificacao } from '../domain/value-objects/contexto-classificacao.vo.js';
import { OrcamentoId } from '../domain/value-objects/orcamento-id.vo.js';

/**
 * Shape mínimo do payload bruto dos eventos `OrcamentoClassificado`/
 * `OrcamentoReclassificadoPorRevisaoHumana` (`source: nexo.ingestao-identificacao`,
 * spec 001) relevante a este BC — apenas os campos usados por
 * `ContextoClassificacao`, nunca o shape completo do evento (ex.:
 * `referenciaBruta` é ignorado, este BC nunca acessa o documento bruto).
 * Contrato JSON local, não tipo de domínio importado do BC Ingestão &
 * Identificação (fronteira de Bounded Context). O segundo `detailType` é
 * publicado por `ConfirmarRevisaoHumana` (T055/#60) e reaproveita o mesmo
 * shape de `resultado`, com `agenteOrigem: 'HUMANO'` (issue #744).
 */
const DETAIL_TYPES_ORCAMENTO_CLASSIFICADO = [
  'OrcamentoClassificado',
  'OrcamentoReclassificadoPorRevisaoHumana',
] as const;
type DetailTypeOrcamentoClassificado = (typeof DETAIL_TYPES_ORCAMENTO_CLASSIFICADO)[number];

interface OrcamentoClassificadoPayloadBruto {
  readonly orcamentoId: string;
  readonly detailType: DetailTypeOrcamentoClassificado;
  readonly resultado: {
    readonly fornecedorIdentificado: string;
    readonly formatoIdentificado: string;
  };
  /**
   * (spec 007, ADR-008 — cutover de contract, #632) Obrigatório desde
   * `schemaVersion: 2` do envelope de origem (spec 001) — o type guard
   * estrutural (`ehOrcamentoClassificadoPayloadBruto`) já rejeita ausente.
   */
  readonly tenantId: string;
}

/**
 * Valida também `detailType` (mesmo rigor de `OrcamentoExtraidoEventACL`/
 * `OrcamentoValidadoEventACL`, achado do `backend-reviewer`, PR #558) — um
 * payload roteado por engano de outro evento nunca deve passar só porque
 * coincide de ter `orcamentoId`/`resultado` com o shape esperado.
 */
function ehOrcamentoClassificadoPayloadBruto(
  valor: unknown,
): valor is OrcamentoClassificadoPayloadBruto {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const objeto = valor as Record<string, unknown>;
  if (typeof objeto.orcamentoId !== 'string') {
    return false;
  }
  if (
    typeof objeto.detailType !== 'string' ||
    !(DETAIL_TYPES_ORCAMENTO_CLASSIFICADO as readonly string[]).includes(objeto.detailType)
  ) {
    return false;
  }
  const resultado = objeto.resultado;
  if (typeof resultado !== 'object' || resultado === null) {
    return false;
  }
  const resultadoObjeto = resultado as Record<string, unknown>;
  if (
    typeof resultadoObjeto.fornecedorIdentificado !== 'string' ||
    typeof resultadoObjeto.formatoIdentificado !== 'string'
  ) {
    return false;
  }
  return typeof objeto.tenantId === 'string';
}

/**
 * Anti-Corruption Layer entre o Domain deste BC e o payload bruto do evento
 * `OrcamentoClassificado` (T017) — traduz para `ContextoClassificacao`, nunca
 * importando tipos de domínio do BC Ingestão & Identificação. `payloadBruto`
 * é entrada não confiável: qualquer desvio do contrato mínimo lança
 * `OrcamentoClassificadoEventACLInvalidoError` (Domain), nunca uma exceção
 * genérica de parsing.
 */
export class OrcamentoClassificadoEventACL implements OrcamentoClassificadoEventACLPort {
  traduzir(payloadBruto: unknown): OrcamentoClassificadoEventACLResultado {
    if (!ehOrcamentoClassificadoPayloadBruto(payloadBruto)) {
      throw new OrcamentoClassificadoEventACLInvalidoError(
        `esperado objeto com "orcamentoId" (string), "detailType" (${DETAIL_TYPES_ORCAMENTO_CLASSIFICADO.map((tipo) => `"${tipo}"`).join('|')}) e "resultado.fornecedorIdentificado"/"resultado.formatoIdentificado" (string)`,
      );
    }
    return {
      orcamentoId: OrcamentoId.de(payloadBruto.orcamentoId),
      contextoClassificacao: ContextoClassificacao.de({
        fornecedorIdentificado: payloadBruto.resultado.fornecedorIdentificado,
        formatoIdentificado: payloadBruto.resultado.formatoIdentificado,
      }),
      tenantId: TenantId.de(payloadBruto.tenantId),
    };
  }
}
