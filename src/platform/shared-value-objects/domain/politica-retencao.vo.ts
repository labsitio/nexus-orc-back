import { CategoriaDocumento } from './categoria-documento.vo.js';
import { ErroDominio } from './errors/erro-dominio.js';

export class PrazoEmDiasInvalidoError extends ErroDominio {
  constructor(valor: number) {
    super(`PoliticaRetencao.prazoEmDias inválido: "${valor}" — esperado um inteiro positivo`);
  }
}

export class BaseLegalInvalidaError extends ErroDominio {
  constructor() {
    super('PoliticaRetencao.baseLegal inválida: esperado texto não vazio');
  }
}

export class AtualizadaEmInvalidaError extends ErroDominio {
  constructor() {
    super('PoliticaRetencao.atualizadaEm inválida: esperado uma data válida');
  }
}

export interface PoliticaRetencaoProps {
  categoria: CategoriaDocumento;
  prazoEmDias: number;
  baseLegal: string;
  atualizadaEm: Date;
}

/**
 * Política de retenção de dados, por categoria de documento, compartilhada
 * por todos os Bounded Contexts (ADR-004, spec-008). Configuração dinâmica
 * lida por cada BC para expirar/anonimizar dados sem exigir deploy de código.
 */
export class PoliticaRetencao {
  private constructor(
    readonly categoria: CategoriaDocumento,
    readonly prazoEmDias: number,
    readonly baseLegal: string,
    readonly atualizadaEm: Date,
  ) {}

  static de(props: PoliticaRetencaoProps): PoliticaRetencao {
    if (!Number.isInteger(props.prazoEmDias) || props.prazoEmDias <= 0) {
      throw new PrazoEmDiasInvalidoError(props.prazoEmDias);
    }
    if (props.baseLegal.trim().length === 0) {
      throw new BaseLegalInvalidaError();
    }
    if (Number.isNaN(props.atualizadaEm.getTime())) {
      throw new AtualizadaEmInvalidaError();
    }
    return new PoliticaRetencao(
      props.categoria,
      props.prazoEmDias,
      props.baseLegal,
      props.atualizadaEm,
    );
  }

  equals(outra: PoliticaRetencao): boolean {
    return (
      this.categoria.equals(outra.categoria) &&
      this.prazoEmDias === outra.prazoEmDias &&
      this.baseLegal === outra.baseLegal &&
      this.atualizadaEm.getTime() === outra.atualizadaEm.getTime()
    );
  }
}
