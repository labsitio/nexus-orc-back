import { ErroDominio } from './errors/erro-dominio.js';

export const METODOS_ANONIMIZACAO_VALIDOS = ['MASCARAMENTO', 'REMOCAO'] as const;

export type MetodoAnonimizacao = (typeof METODOS_ANONIMIZACAO_VALIDOS)[number];

export class CampoOriginalInvalidoError extends ErroDominio {
  constructor() {
    super('DadoAnonimizado.campoOriginal inválido: esperado texto não vazio');
  }
}

export class MetodoAnonimizacaoInvalidoError extends ErroDominio {
  constructor(valor: string) {
    super(
      `DadoAnonimizado.metodo inválido: "${valor}" — esperado um de ${METODOS_ANONIMIZACAO_VALIDOS.join(', ')}`,
    );
  }
}

export class AplicadoEmInvalidoError extends ErroDominio {
  constructor() {
    super('DadoAnonimizado.aplicadoEm inválido: esperado uma data válida');
  }
}

export class SolicitacaoIdInvalidaError extends ErroDominio {
  constructor() {
    super('DadoAnonimizado.solicitacaoId inválida: esperado texto não vazio');
  }
}

export interface DadoAnonimizadoProps {
  campoOriginal: string;
  metodo: MetodoAnonimizacao;
  aplicadoEm: Date;
  solicitacaoId: string;
}

/**
 * Marcador de campo anonimizado (ADR-004, spec-008), compartilhado por todos
 * os Bounded Contexts. Deliberadamente sem construtor que aceite o valor
 * original de volta — impede reconstrução acidental do dado pessoal a partir
 * do próprio código de domínio (irreversibilidade da anonimização).
 */
export class DadoAnonimizado {
  private constructor(
    readonly campoOriginal: string,
    readonly metodo: MetodoAnonimizacao,
    readonly aplicadoEm: Date,
    readonly solicitacaoId: string,
  ) {}

  static de(props: DadoAnonimizadoProps): DadoAnonimizado {
    if (props.campoOriginal.trim().length === 0) {
      throw new CampoOriginalInvalidoError();
    }
    if (!METODOS_ANONIMIZACAO_VALIDOS.includes(props.metodo)) {
      throw new MetodoAnonimizacaoInvalidoError(props.metodo);
    }
    if (Number.isNaN(props.aplicadoEm.getTime())) {
      throw new AplicadoEmInvalidoError();
    }
    if (props.solicitacaoId.trim().length === 0) {
      throw new SolicitacaoIdInvalidaError();
    }
    return new DadoAnonimizado(
      props.campoOriginal,
      props.metodo,
      props.aplicadoEm,
      props.solicitacaoId,
    );
  }

  equals(outro: DadoAnonimizado): boolean {
    return (
      this.campoOriginal === outro.campoOriginal &&
      this.metodo === outro.metodo &&
      this.aplicadoEm.getTime() === outro.aplicadoEm.getTime() &&
      this.solicitacaoId === outro.solicitacaoId
    );
  }
}
