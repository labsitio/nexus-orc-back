import { ErroDominio } from '../domain/errors/erro-dominio.js';
import { CategoriaItem } from '../domain/value-objects/categoria-item.vo.js';

export class BedrockCategorizacaoACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`BedrockCategorizacaoACL: saída estruturada inválida — ${mensagem}`);
  }
}

/**
 * Shape reportado pela saída estruturada (tool-use/JSON Schema) do Bedrock —
 * nunca texto livre interpretado por regex. `categoria` MUST pertencer ao
 * `catalogoCategorias` informado na chamada (plan.md, ADR-002); esta ACL é
 * quem faz cumprir essa restrição, nunca confiando cegamente na saída do
 * modelo (mesma disciplina de `BedrockInterpretacaoConsultaACL`, spec 004).
 */
export interface CategorizacaoBruta {
  readonly categoria: string;
}

/**
 * Type guard estrutural — nunca confia cegamente no shape reportado pelo
 * LLM antes de repassar a `CategoriaItem.de`.
 */
export function ehCategorizacaoBruta(valor: unknown): valor is CategorizacaoBruta {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return typeof registro.categoria === 'string';
}

/**
 * Anti-Corruption Layer que traduz a saída estruturada (tool-use) do Bedrock
 * em `CategoriaItem` — mesma disciplina de `BedrockInterpretacaoConsultaACL`
 * (spec 004) e `BedrockExtracaoACL` (spec 002): o JSON bruto do modelo nunca
 * cruza para o Domain sem passar por um tradutor explícito.
 *
 * Responsabilidade central: rejeitar (nunca "corrigir para o mais próximo")
 * qualquer `categoria` fora do `catalogoCategorias` configurado — o modelo
 * nunca decide sozinho que categoria existe no sistema, essa é sempre uma
 * decisão determinística do catálogo fornecido pelo chamador
 * (`BedrockCategorizadorItemGateway`, T041), nunca desta ACL.
 */
export class BedrockCategorizacaoACL {
  converter(bruto: CategorizacaoBruta, catalogoCategorias: readonly string[]): CategoriaItem {
    if (!catalogoCategorias.includes(bruto.categoria)) {
      throw new BedrockCategorizacaoACLInvalidaError(
        `categoria "${bruto.categoria}" não pertence ao catálogo configurado`,
      );
    }

    return CategoriaItem.de(bruto.categoria);
  }
}
