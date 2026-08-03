import { OrcamentoClassificadoEventACLInvalidoError } from '../domain/errors/evento-upstream-acl.errors.js';
import type {
  OrcamentoClassificadoEventACL as OrcamentoClassificadoEventACLPort,
  OrcamentoClassificadoEventACLResultado,
} from '../domain/gateways/orcamento-classificado-event.acl.js';
import { ContextoClassificacao } from '../domain/value-objects/contexto-classificacao.vo.js';
import { OrcamentoId } from '../domain/value-objects/orcamento-id.vo.js';

/**
 * Shape mínimo do payload bruto do evento `OrcamentoClassificado`
 * (`source: nexo.ingestao-identificacao`, spec 001) relevante a este BC —
 * apenas os campos usados por `ContextoClassificacao`, nunca o shape
 * completo do evento (ex.: `referenciaBruta` é ignorado, este BC nunca
 * acessa o documento bruto). Contrato JSON local, não tipo de domínio
 * importado do BC Ingestão & Identificação (fronteira de Bounded Context).
 */
interface OrcamentoClassificadoPayloadBruto {
  readonly orcamentoId: string;
  readonly resultado: {
    readonly fornecedorIdentificado: string;
    readonly formatoIdentificado: string;
  };
}

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
  const resultado = objeto.resultado;
  if (typeof resultado !== 'object' || resultado === null) {
    return false;
  }
  const resultadoObjeto = resultado as Record<string, unknown>;
  return (
    typeof resultadoObjeto.fornecedorIdentificado === 'string' &&
    typeof resultadoObjeto.formatoIdentificado === 'string'
  );
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
        'esperado objeto com "orcamentoId" (string) e "resultado.fornecedorIdentificado"/"resultado.formatoIdentificado" (string)',
      );
    }
    return {
      orcamentoId: OrcamentoId.de(payloadBruto.orcamentoId),
      contextoClassificacao: ContextoClassificacao.de({
        fornecedorIdentificado: payloadBruto.resultado.fornecedorIdentificado,
        formatoIdentificado: payloadBruto.resultado.formatoIdentificado,
      }),
    };
  }
}
