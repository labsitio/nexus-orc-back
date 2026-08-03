import { OrcamentoValidadoEventACLInvalidoError } from '../domain/errors/evento-upstream-acl.errors.js';
import type {
  OrcamentoValidadoEventACL as OrcamentoValidadoEventACLPort,
  OrcamentoValidadoEventACLResultado,
} from '../domain/gateways/orcamento-validado-event.acl.js';
import {
  ContextoValidacao,
  type InconsistenciaAceita,
} from '../domain/value-objects/contexto-validacao.vo.js';
import { OrcamentoId } from '../domain/value-objects/orcamento-id.vo.js';

const DETAIL_TYPES_ORCAMENTO_VALIDADO = [
  'OrcamentoValidado',
  'OrcamentoValidadoComRessalva',
] as const;
type DetailTypeOrcamentoValidado = (typeof DETAIL_TYPES_ORCAMENTO_VALIDADO)[number];

/** `InconsistenciaDetectada` bruta (spec 003) — só os 2 campos usados por `ContextoValidacao`. */
interface InconsistenciaDetectadaBruta {
  readonly regra: string;
  readonly detalhe: string;
}

/**
 * Shape mínimo do payload bruto dos eventos `OrcamentoValidado`/
 * `OrcamentoValidadoComRessalva` (`source: nexo.validacao`, spec 003,
 * `schemaVersion: 2` desde o amendment ADR-003/spec 004) relevante a este
 * BC — contrato JSON local, não tipo de domínio importado do BC Validação.
 * `itens`/`condicoesComerciais` (payload enriquecido para o BC Busca &
 * Indexação) são deliberadamente ignorados: `ContextoValidacao` só precisa
 * do resultado e das inconsistências aceitas para fundamentar a decisão de
 * roteamento (plan.md) — a extração já foi resumida via
 * `OrcamentoExtraidoEventACL`.
 */
interface OrcamentoValidadoPayloadBruto {
  readonly orcamentoId: string;
  readonly detailType: DetailTypeOrcamentoValidado;
  readonly inconsistencias?: readonly InconsistenciaDetectadaBruta[];
}

function ehInconsistenciaDetectadaBruta(valor: unknown): valor is InconsistenciaDetectadaBruta {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const objeto = valor as Record<string, unknown>;
  return typeof objeto.regra === 'string' && typeof objeto.detalhe === 'string';
}

function ehOrcamentoValidadoPayloadBruto(valor: unknown): valor is OrcamentoValidadoPayloadBruto {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const objeto = valor as Record<string, unknown>;
  if (typeof objeto.orcamentoId !== 'string') {
    return false;
  }
  if (
    typeof objeto.detailType !== 'string' ||
    !(DETAIL_TYPES_ORCAMENTO_VALIDADO as readonly string[]).includes(objeto.detailType)
  ) {
    return false;
  }
  if (objeto.detailType === 'OrcamentoValidadoComRessalva') {
    return (
      Array.isArray(objeto.inconsistencias) &&
      objeto.inconsistencias.every(ehInconsistenciaDetectadaBruta)
    );
  }
  return true;
}

/**
 * Anti-Corruption Layer entre o Domain deste BC e o payload bruto dos
 * eventos `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (T017) —
 * traduz para `ContextoValidacao`, nunca importando tipos de domínio do BC
 * Validação. Este é o evento gatilho da decisão de workflow (último da
 * cadeia causal). `payloadBruto` é entrada não confiável: qualquer desvio
 * do contrato mínimo lança `OrcamentoValidadoEventACLInvalidoError` (Domain).
 */
export class OrcamentoValidadoEventACL implements OrcamentoValidadoEventACLPort {
  traduzir(payloadBruto: unknown): OrcamentoValidadoEventACLResultado {
    if (!ehOrcamentoValidadoPayloadBruto(payloadBruto)) {
      throw new OrcamentoValidadoEventACLInvalidoError(
        'esperado objeto com "orcamentoId" (string), "detailType" ("OrcamentoValidado"|"OrcamentoValidadoComRessalva") e, quando "OrcamentoValidadoComRessalva", "inconsistencias" (array de {regra, detalhe})',
      );
    }
    const inconsistenciasAceitas: readonly InconsistenciaAceita[] = (
      payloadBruto.inconsistencias ?? []
    ).map((inconsistencia) => ({ regra: inconsistencia.regra, detalhe: inconsistencia.detalhe }));

    return {
      orcamentoId: OrcamentoId.de(payloadBruto.orcamentoId),
      contextoValidacao: ContextoValidacao.de({
        resultado:
          payloadBruto.detailType === 'OrcamentoValidadoComRessalva'
            ? 'VALIDADO_COM_RESSALVA'
            : 'VALIDADO',
        inconsistenciasAceitas,
      }),
    };
  }
}
