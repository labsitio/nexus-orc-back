import { ErroDominio } from '../errors/erro-dominio.js';
import type { NivelConfianca } from './nivel-confianca.vo.js';

export type AcaoRoteamento = 'APROVAR' | 'ENCAMINHAR_COMPRADOR' | 'SOLICITAR_REENVIO';
export type AgenteOrigemDecisao = 'ORQUESTRADOR' | 'HUMANO';

/**
 * Contrato mínimo de `ContextoValidacao` (VO de T009, spec 005, ainda não
 * mergeado em `main` no momento desta implementação — ver ADR/PR desta
 * task). Não duplica o arquivo de T009: expõe apenas o campo que a
 * invariante de `DecisaoRoteamento` precisa. Quando T009 for mergeado,
 * substituir por import do VO real (mesmo shape estrutural esperado).
 */
export interface ContextoValidacaoParaDecisao {
  readonly resultado: 'VALIDADO' | 'VALIDADO_COM_RESSALVA' | string;
}

export class AprovacaoSemValidacaoError extends ErroDominio {
  constructor() {
    super(
      'Decisão de APROVAR exige contextoValidacao com resultado VALIDADO ou VALIDADO_COM_RESSALVA',
    );
  }
}

export class ReenvioSemFundamentoError extends ErroDominio {
  constructor() {
    super(
      'Decisão de SOLICITAR_REENVIO exige motivoDadoAusente não vazio, referenciando inconsistência/pendência concreta',
    );
  }
}

export class CriterioAusenteError extends ErroDominio {
  constructor() {
    super('Decisão automática (agenteOrigem !== HUMANO) exige criterio não vazio');
  }
}

export interface CriarDecisaoRoteamentoInput {
  readonly acao: AcaoRoteamento;
  readonly nivelConfianca: NivelConfianca | null;
  readonly criterio: string;
  readonly agenteOrigem: AgenteOrigemDecisao;
  readonly requerIntegracaoExterna: boolean;
  readonly motivoDadoAusente?: string;
  /**
   * Não persistido no VO (ver Value Objects, plan.md — campos de
   * `DecisaoRoteamento` não incluem `contextoValidacao`); usado apenas para
   * validar a invariante "nunca aprovar sem validação bem-sucedida" no
   * momento da construção.
   */
  readonly contextoValidacao?: ContextoValidacaoParaDecisao;
}

const RESULTADOS_VALIDACAO_APROVAVEIS = new Set(['VALIDADO', 'VALIDADO_COM_RESSALVA']);

/**
 * VO mais crítico da spec 005: nenhuma instância inválida é representável.
 * Estruturalmente impede aprovação sem validação bem-sucedida, reenvio sem
 * fundamento e decisão automática sem critério auditável.
 */
export class DecisaoRoteamento {
  readonly acao: AcaoRoteamento;
  readonly nivelConfianca: NivelConfianca | null;
  readonly criterio: string;
  readonly agenteOrigem: AgenteOrigemDecisao;
  readonly requerIntegracaoExterna: boolean;
  readonly motivoDadoAusente?: string;

  private constructor(input: CriarDecisaoRoteamentoInput) {
    this.acao = input.acao;
    this.nivelConfianca = input.nivelConfianca;
    this.criterio = input.criterio;
    this.agenteOrigem = input.agenteOrigem;
    this.requerIntegracaoExterna = input.requerIntegracaoExterna;
    this.motivoDadoAusente = input.motivoDadoAusente;
  }

  static criar(input: CriarDecisaoRoteamentoInput): DecisaoRoteamento {
    if (
      input.acao === 'APROVAR' &&
      !(
        input.contextoValidacao &&
        RESULTADOS_VALIDACAO_APROVAVEIS.has(input.contextoValidacao.resultado)
      )
    ) {
      throw new AprovacaoSemValidacaoError();
    }

    if (input.acao === 'SOLICITAR_REENVIO' && !input.motivoDadoAusente?.trim()) {
      throw new ReenvioSemFundamentoError();
    }

    if (input.agenteOrigem !== 'HUMANO' && !input.criterio?.trim()) {
      throw new CriterioAusenteError();
    }

    return new DecisaoRoteamento(input);
  }
}
