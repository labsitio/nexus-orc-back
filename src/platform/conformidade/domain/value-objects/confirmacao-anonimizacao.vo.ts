import { DadoAnonimizado } from '../../../shared-value-objects/domain/dado-anonimizado.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class BoundedContextInvalidoError extends ErroDominio {
  constructor() {
    super('ConfirmacaoAnonimizacao.boundedContext inválido: esperado texto não vazio');
  }
}

export class OrcamentoIdInvalidoError extends ErroDominio {
  constructor() {
    super('ConfirmacaoAnonimizacao.orcamentoId inválido: esperado texto não vazio');
  }
}

export class ConfirmadoEmInvalidoError extends ErroDominio {
  constructor() {
    super('ConfirmacaoAnonimizacao.confirmadoEm inválido: esperado uma data válida');
  }
}

export interface ConfirmacaoAnonimizacaoProps {
  boundedContext: string;
  orcamentoId: string;
  camposAnonimizados: readonly DadoAnonimizado[];
  confirmadoEm: Date;
}

/**
 * Confirmação de anonimização de um Bounded Context em resposta a
 * `SolicitacaoEsquecimentoRegistrada` (plan.md, seção Agregado —
 * `{ boundedContext, orcamentoId, camposAnonimizados, confirmadoEm }`).
 * `camposAnonimizados` pode ser vazio: BC sem dado do titular confirma
 * explicitamente "nada a fazer" (plan.md — nunca silêncio).
 */
export class ConfirmacaoAnonimizacao {
  private constructor(
    readonly boundedContext: string,
    readonly orcamentoId: string,
    private readonly _camposAnonimizados: readonly DadoAnonimizado[],
    readonly confirmadoEm: Date,
  ) {}

  static de(props: ConfirmacaoAnonimizacaoProps): ConfirmacaoAnonimizacao {
    if (props.boundedContext.trim().length === 0) {
      throw new BoundedContextInvalidoError();
    }
    if (props.orcamentoId.trim().length === 0) {
      throw new OrcamentoIdInvalidoError();
    }
    if (Number.isNaN(props.confirmadoEm.getTime())) {
      throw new ConfirmadoEmInvalidoError();
    }
    return new ConfirmacaoAnonimizacao(
      props.boundedContext,
      props.orcamentoId,
      [...props.camposAnonimizados],
      props.confirmadoEm,
    );
  }

  get camposAnonimizados(): readonly DadoAnonimizado[] {
    return [...this._camposAnonimizados];
  }
}
