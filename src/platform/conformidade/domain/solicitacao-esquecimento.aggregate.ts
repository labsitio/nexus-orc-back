import { ErroDominio } from './errors/erro-dominio.js';
import { ConfirmacaoAnonimizacao } from './value-objects/confirmacao-anonimizacao.vo.js';
import { ReferenciaTitular } from './value-objects/referencia-titular.vo.js';
import { SolicitacaoEsquecimentoId } from './value-objects/solicitacao-esquecimento-id.vo.js';
import { StatusSolicitacao } from './value-objects/status-solicitacao.vo.js';

export class ContextoNaoEsperadoError extends ErroDominio {
  constructor(boundedContext: string) {
    super(
      `SolicitacaoEsquecimento: contexto "${boundedContext}" não está em contextosEsperados — confirmação rejeitada`,
    );
  }
}

export class ConfirmacaoDuplicadaError extends ErroDominio {
  constructor(boundedContext: string) {
    super(
      `SolicitacaoEsquecimento: contexto "${boundedContext}" já confirmou anonimização — confirmação duplicada rejeitada`,
    );
  }
}

export class SolicitacaoJaFinalizadaError extends ErroDominio {
  constructor(status: string) {
    super(
      `SolicitacaoEsquecimento: já está em status terminal "${status}" — não aceita novas confirmações`,
    );
  }
}

export class ContextosEsperadosInvalidosError extends ErroDominio {
  constructor() {
    super(
      'SolicitacaoEsquecimento: contextosEsperados inválido — esperada lista não vazia, sem duplicatas',
    );
  }
}

export class PrazoLimiteInvalidoError extends ErroDominio {
  constructor() {
    super('SolicitacaoEsquecimento: prazoLimite inválido — esperada uma data válida');
  }
}

export interface SolicitacaoEsquecimentoProps {
  readonly titularReferencia: ReferenciaTitular;
  readonly contextosEsperados: readonly string[];
  readonly prazoLimite: Date;
  readonly registradaEm?: Date;
}

export interface SolicitacaoEsquecimentoReconstituirProps {
  readonly id: SolicitacaoEsquecimentoId;
  readonly titularReferencia: ReferenciaTitular;
  readonly contextosEsperados: readonly string[];
  readonly prazoLimite: Date;
  readonly registradaEm: Date;
  readonly status: StatusSolicitacao;
  readonly confirmacoes: readonly ConfirmacaoAnonimizacao[];
}

/**
 * Agregado de coordenação do componente de plataforma Conformidade
 * (plan.md, seção Agregado). Não modela nenhum conceito de negócio de
 * compras — modela apenas o processo regulatório do direito ao
 * esquecimento (LGPD).
 *
 * Invariante central: só transita para `CONCLUIDA` quando `confirmacoes`
 * cobre 100% de `contextosEsperados`. Nunca autoconclui por decurso de
 * `prazoLimite` — este agregado não expõe nenhum método sensível a tempo
 * (relógio); a transição para `PRAZO_EXCEDIDO` é decidida por um processo
 * externo (job agendado, Application) que invoca explicitamente o
 * agregado, nunca por efeito colateral implícito de leitura de estado
 * (mesmo espírito do Princípio IV: nenhuma fila autoaprova por exaustão de
 * tempo).
 */
export class SolicitacaoEsquecimento {
  private _status: StatusSolicitacao;
  private _confirmacoes: ConfirmacaoAnonimizacao[] = [];

  private constructor(
    readonly id: SolicitacaoEsquecimentoId,
    readonly titularReferencia: ReferenciaTitular,
    readonly contextosEsperados: readonly string[],
    readonly prazoLimite: Date,
    readonly registradaEm: Date,
    status: StatusSolicitacao,
  ) {
    this._status = status;
  }

  static criar(props: SolicitacaoEsquecimentoProps): SolicitacaoEsquecimento {
    const contextosUnicos = new Set(props.contextosEsperados);
    if (contextosUnicos.size === 0 || contextosUnicos.size !== props.contextosEsperados.length) {
      throw new ContextosEsperadosInvalidosError();
    }
    if (Number.isNaN(props.prazoLimite.getTime())) {
      throw new PrazoLimiteInvalidoError();
    }

    return new SolicitacaoEsquecimento(
      SolicitacaoEsquecimentoId.novo(),
      props.titularReferencia,
      [...props.contextosEsperados],
      props.prazoLimite,
      props.registradaEm ?? new Date(),
      StatusSolicitacao.registrada(),
    );
  }

  /** Reidrata o agregado a partir de estado já persistido (Infrastructure). */
  static reconstituir(props: SolicitacaoEsquecimentoReconstituirProps): SolicitacaoEsquecimento {
    const solicitacao = new SolicitacaoEsquecimento(
      props.id,
      props.titularReferencia,
      [...props.contextosEsperados],
      props.prazoLimite,
      props.registradaEm,
      props.status,
    );
    solicitacao._confirmacoes = [...props.confirmacoes];
    return solicitacao;
  }

  get status(): StatusSolicitacao {
    return this._status;
  }

  /** Confirmações recebidas — cópia defensiva, nunca expõe o array mutável interno. */
  get confirmacoes(): readonly ConfirmacaoAnonimizacao[] {
    return [...this._confirmacoes];
  }

  /**
   * Registra a confirmação de anonimização de um Bounded Context
   * (consumidor de `DadoPessoalAnonimizadoNoContexto`, plan.md). Rejeita
   * contexto fora de `contextosEsperados` e confirmação duplicada do mesmo
   * contexto — o agregado nunca sobrescreve nem soma duas confirmações do
   * mesmo `boundedContext`. Só transita para `CONCLUIDA` quando a cobertura
   * chega a 100% de `contextosEsperados`; do contrário permanece/transita
   * para `EM_ANDAMENTO`.
   */
  registrarConfirmacao(confirmacao: ConfirmacaoAnonimizacao): void {
    if (this._status.valor === 'CONCLUIDA' || this._status.valor === 'PRAZO_EXCEDIDO') {
      throw new SolicitacaoJaFinalizadaError(this._status.valor);
    }
    if (!this.contextosEsperados.includes(confirmacao.boundedContext)) {
      throw new ContextoNaoEsperadoError(confirmacao.boundedContext);
    }
    if (this._confirmacoes.some((c) => c.boundedContext === confirmacao.boundedContext)) {
      throw new ConfirmacaoDuplicadaError(confirmacao.boundedContext);
    }

    this._confirmacoes.push(confirmacao);

    const cobriuTodosOsContextos = this.contextosEsperados.every((contexto) =>
      this._confirmacoes.some((c) => c.boundedContext === contexto),
    );

    this._status = cobriuTodosOsContextos
      ? StatusSolicitacao.concluida()
      : StatusSolicitacao.emAndamento();
  }
}
