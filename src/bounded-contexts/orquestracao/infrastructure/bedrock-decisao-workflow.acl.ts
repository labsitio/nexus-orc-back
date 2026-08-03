import { ErroDominio } from '../domain/errors/erro-dominio.js';
import {
  ACOES_ROTEAMENTO,
  type AcaoRoteamento,
} from '../domain/value-objects/decisao-roteamento.vo.js';
import { NivelConfianca } from '../domain/value-objects/nivel-confianca.vo.js';
import type { ResultadoOrquestrador } from '../domain/aggregates/decisao-workflow.aggregate.js';

export class BedrockDecisaoWorkflowACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`BedrockDecisaoWorkflowACL: saída estruturada inválida — ${mensagem}`);
  }
}

export interface DecisaoWorkflowBruta {
  readonly acao: string;
  readonly nivelConfianca: number;
  readonly criterio: string;
  readonly requerIntegracaoExterna: boolean;
  readonly motivoDadoAusente?: string;
}

/** Type guard estrutural — nunca confia cegamente no shape reportado pelo LLM. */
export function ehDecisaoWorkflowBruta(valor: unknown): valor is DecisaoWorkflowBruta {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro.acao === 'string' &&
    typeof registro.nivelConfianca === 'number' &&
    typeof registro.criterio === 'string' &&
    typeof registro.requerIntegracaoExterna === 'boolean'
  );
}

const ACOES_VALIDAS = new Set<string>(ACOES_ROTEAMENTO);

/**
 * Anti-Corruption Layer que traduz a saída estruturada (tool-use) do agente
 * Orquestrador (Bedrock) em `ResultadoOrquestrador`, o único shape que o
 * agregado `DecisaoWorkflow` aceita (`registrarTentativaOrquestrador`).
 *
 * Mitigação estrutural contra "confiança artificial" (Segurança, plan.md):
 * rejeita qualquer resposta sem `criterio` textual não vazio, mesmo que o
 * restante do shape esteja correto — uma decisão automática sem base
 * auditável nunca chega ao Domain. Rejeita também `acao` fora do catálogo
 * fechado (`ACOES_ROTEAMENTO`) — o agente nunca pode inventar uma ação fora
 * do vocabulário de negócio.
 */
export class BedrockDecisaoWorkflowACL {
  converter(bruto: DecisaoWorkflowBruta): ResultadoOrquestrador {
    if (!ACOES_VALIDAS.has(bruto.acao)) {
      throw new BedrockDecisaoWorkflowACLInvalidaError(
        `"acao" reportada ("${bruto.acao}") fora do catálogo fechado (${ACOES_ROTEAMENTO.join(', ')})`,
      );
    }

    if (!bruto.criterio.trim()) {
      throw new BedrockDecisaoWorkflowACLInvalidaError(
        '"criterio" não pode ser vazio — decisão sem base auditável',
      );
    }

    return {
      acao: bruto.acao as AcaoRoteamento,
      nivelConfianca: NivelConfianca.de(bruto.nivelConfianca),
      criterio: bruto.criterio.trim(),
      requerIntegracaoExterna: bruto.requerIntegracaoExterna,
      motivoDadoAusente: bruto.motivoDadoAusente?.trim() || undefined,
    };
  }
}
