import { ErroDominio } from '../domain/errors/erro-dominio.js';
import { CriterioBusca } from '../domain/value-objects/criterio-busca.vo.js';
import { Dinheiro } from '../domain/value-objects/dinheiro.vo.js';

export class BedrockInterpretacaoConsultaACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`BedrockInterpretacaoConsultaACL: saída estruturada inválida — ${mensagem}`);
  }
}

interface FaixaPrecoBruta {
  readonly valorCentavos: number;
  readonly moeda: string;
}

interface PeriodoRecebimentoBruto {
  readonly inicio: string;
  readonly fim: string;
}

/**
 * Shape reportado pela saída estruturada (tool-use) do Bedrock — nunca texto
 * livre interpretado por regex. `categoria`, quando presente, MUST pertencer
 * ao `catalogoCategorias` informado na chamada (plan.md, mesma disciplina do
 * Categorizador de Item da spec 003); esta ACL é quem faz cumprir essa
 * restrição, nunca confiando cegamente na saída do modelo.
 */
export interface InterpretacaoConsultaBruta {
  readonly categoria?: string;
  readonly precoMinimo?: FaixaPrecoBruta;
  readonly precoMaximo?: FaixaPrecoBruta;
  readonly periodoRecebimento?: PeriodoRecebimentoBruto;
  readonly textoLivreResidual: string;
}

function ehFaixaPrecoBruta(valor: unknown): valor is FaixaPrecoBruta {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return typeof registro.valorCentavos === 'number' && typeof registro.moeda === 'string';
}

function ehPeriodoRecebimentoBruto(valor: unknown): valor is PeriodoRecebimentoBruto {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return typeof registro.inicio === 'string' && typeof registro.fim === 'string';
}

/**
 * Type guard estrutural — nunca confia cegamente no shape reportado pelo LLM.
 * Valida cada campo opcional aninhado (`precoMinimo`/`precoMaximo`/`periodoRecebimento`)
 * quando presente, para que `converter` nunca repasse tipo incorreto a
 * `Dinheiro.de`/`new Date` e lance exceção não controlada em vez de erro de
 * domínio explícito (mesma disciplina de `ehEmbeddingBruto`, T028, que valida
 * cada elemento do array de embedding).
 */
export function ehInterpretacaoConsultaBruta(valor: unknown): valor is InterpretacaoConsultaBruta {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;

  if (typeof registro.textoLivreResidual !== 'string') return false;
  if (registro.categoria !== undefined && typeof registro.categoria !== 'string') return false;
  if (registro.precoMinimo !== undefined && !ehFaixaPrecoBruta(registro.precoMinimo)) return false;
  if (registro.precoMaximo !== undefined && !ehFaixaPrecoBruta(registro.precoMaximo)) return false;
  if (
    registro.periodoRecebimento !== undefined &&
    !ehPeriodoRecebimentoBruto(registro.periodoRecebimento)
  ) {
    return false;
  }

  return true;
}

/**
 * Anti-Corruption Layer que traduz a saída estruturada (tool-use) do Bedrock
 * em `CriterioBusca` — mesma disciplina de `BedrockExtracaoACL` (spec 002) e
 * `BedrockEmbeddingACL` (T028): o JSON bruto do modelo nunca cruza para fora
 * da Infrastructure sem passar por um tradutor explícito.
 *
 * Responsabilidade central desta ACL, distinta das demais: rejeitar
 * (nunca "corrigir para o mais próximo") qualquer `categoria` fora do
 * `catalogoCategorias` configurado — o modelo nunca decide sozinho que
 * categoria existe no sistema, essa é sempre uma decisão determinística do
 * catálogo fornecido pelo chamador (`BedrockInterpretadorConsultaGateway`,
 * T037), nunca desta ACL.
 */
export class BedrockInterpretacaoConsultaACL {
  converter(
    bruto: InterpretacaoConsultaBruta,
    catalogoCategorias: readonly string[],
  ): CriterioBusca {
    if (bruto.categoria !== undefined && !catalogoCategorias.includes(bruto.categoria)) {
      throw new BedrockInterpretacaoConsultaACLInvalidaError(
        `categoria "${bruto.categoria}" não pertence ao catálogo configurado`,
      );
    }

    return CriterioBusca.de({
      categoria: bruto.categoria,
      precoMinimo: bruto.precoMinimo
        ? Dinheiro.de(bruto.precoMinimo.valorCentavos, bruto.precoMinimo.moeda)
        : undefined,
      precoMaximo: bruto.precoMaximo
        ? Dinheiro.de(bruto.precoMaximo.valorCentavos, bruto.precoMaximo.moeda)
        : undefined,
      periodoRecebimento: bruto.periodoRecebimento
        ? {
            inicio: new Date(bruto.periodoRecebimento.inicio),
            fim: new Date(bruto.periodoRecebimento.fim),
          }
        : undefined,
      textoLivreResidual: bruto.textoLivreResidual,
    });
  }
}
