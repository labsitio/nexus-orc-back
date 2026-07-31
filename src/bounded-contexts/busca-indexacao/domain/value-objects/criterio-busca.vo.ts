import { Dinheiro } from './dinheiro.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class CriterioBuscaInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`CriterioBusca inválido: ${mensagem}`);
  }
}

export interface PeriodoRecebimento {
  readonly inicio: Date;
  readonly fim: Date;
}

export interface CriterioBuscaProps {
  readonly categoria?: string;
  readonly precoMinimo?: Dinheiro;
  readonly precoMaximo?: Dinheiro;
  readonly periodoRecebimento?: PeriodoRecebimento;
  readonly textoLivreResidual: string;
}

/**
 * Critério estruturado de busca, produzido pelo `AgenteInterpretadorConsultaGateway`
 * a partir da consulta em linguagem natural, mesclado com filtros explícitos da
 * requisição (filtro explícito nunca é sobrescrito pela interpretação da IA,
 * apenas complementado — plan.md). `categoria` nunca é validada aqui contra o
 * catálogo conhecido: essa disciplina é do gateway (saída estruturada restrita),
 * não do Domain. `textoLivreResidual` é o que sobrou para virar vetor de consulta
 * — pode ser vazio quando os filtros explícitos já bastam.
 */
export class CriterioBusca {
  private constructor(
    readonly textoLivreResidual: string,
    readonly categoria?: string,
    readonly precoMinimo?: Dinheiro,
    readonly precoMaximo?: Dinheiro,
    readonly periodoRecebimento?: PeriodoRecebimento,
  ) {}

  static de(props: CriterioBuscaProps): CriterioBusca {
    if (props.precoMinimo && props.precoMaximo) {
      if (props.precoMinimo.moeda !== props.precoMaximo.moeda) {
        throw new CriterioBuscaInvalidoError(
          `precoMinimo (${props.precoMinimo.moeda}) e precoMaximo (${props.precoMaximo.moeda}) devem estar na mesma moeda`,
        );
      }
      if (props.precoMinimo.valorCentavos > props.precoMaximo.valorCentavos) {
        throw new CriterioBuscaInvalidoError('precoMinimo não pode ser maior que precoMaximo');
      }
    }

    if (props.periodoRecebimento) {
      const { inicio, fim } = props.periodoRecebimento;
      if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
        throw new CriterioBuscaInvalidoError('periodoRecebimento com data inválida');
      }
      if (inicio.getTime() > fim.getTime()) {
        throw new CriterioBuscaInvalidoError('periodoRecebimento.inicio não pode ser após .fim');
      }
    }

    return new CriterioBusca(
      props.textoLivreResidual,
      props.categoria,
      props.precoMinimo,
      props.precoMaximo,
      props.periodoRecebimento
        ? {
            inicio: new Date(props.periodoRecebimento.inicio.getTime()),
            fim: new Date(props.periodoRecebimento.fim.getTime()),
          }
        : undefined,
    );
  }
}
