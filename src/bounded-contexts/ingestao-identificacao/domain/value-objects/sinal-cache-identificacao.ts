import { ErroDominio } from '../errors/erro-dominio.js';
import { AssinaturaEstrutural } from './assinatura-estrutural.js';
import { ResultadoClassificacao } from './resultado-classificacao.vo.js';

export class SinalCacheIdentificacaoInvalidoError extends ErroDominio {
  constructor(motivo: string) {
    super(`SinalCacheIdentificacao inválido: ${motivo}`);
  }
}

export interface SinalCacheIdentificacaoParams {
  readonly assinatura: AssinaturaEstrutural;
  readonly resultadoAnterior: ResultadoClassificacao;
  readonly ultimaConfirmacaoEm: Date;
}

/**
 * Sinal de cache consultado pelo `CacheIdentificacaoGateway` (plan.md, spec-009) —
 * contexto adicional passado ao `AgenteClassificadorGateway`, nunca decide o
 * `nivelConfianca` reportado por conta própria (o agente permanece a única
 * fonte de verdade da confiança — Princípio V).
 */
export class SinalCacheIdentificacao {
  private constructor(
    readonly assinatura: AssinaturaEstrutural,
    readonly resultadoAnterior: ResultadoClassificacao,
    readonly ultimaConfirmacaoEm: Date,
  ) {}

  static criar(params: SinalCacheIdentificacaoParams): SinalCacheIdentificacao {
    if (Number.isNaN(params.ultimaConfirmacaoEm.getTime())) {
      throw new SinalCacheIdentificacaoInvalidoError('ultimaConfirmacaoEm não é uma data válida');
    }
    return new SinalCacheIdentificacao(
      params.assinatura,
      params.resultadoAnterior,
      params.ultimaConfirmacaoEm,
    );
  }
}
