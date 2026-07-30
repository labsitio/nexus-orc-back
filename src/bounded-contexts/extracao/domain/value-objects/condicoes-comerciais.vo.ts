import type { CampoExtraido, CampoExtraidoPayload } from './campo-extraido.vo.js';
import type { PeriodoValidade } from './periodo-validade.vo.js';

export interface CondicoesComerciaisParams {
  readonly condicoesPagamento: CampoExtraido<string>;
  readonly prazoValidade: CampoExtraido<PeriodoValidade>;
  readonly condicoesEntrega: CampoExtraido<string>;
}

export interface CondicoesComerciaisPayload {
  readonly condicoesPagamento: CampoExtraidoPayload<string>;
  readonly prazoValidade: CampoExtraidoPayload<string>;
  readonly condicoesEntrega: CampoExtraidoPayload<string>;
}

/** Condições comerciais do orçamento — mesma disciplina de `CampoExtraido<T>`. */
export class CondicoesComerciais {
  private constructor(
    readonly condicoesPagamento: CampoExtraido<string>,
    readonly prazoValidade: CampoExtraido<PeriodoValidade>,
    readonly condicoesEntrega: CampoExtraido<string>,
  ) {}

  static de(params: CondicoesComerciaisParams): CondicoesComerciais {
    return new CondicoesComerciais(
      params.condicoesPagamento,
      params.prazoValidade,
      params.condicoesEntrega,
    );
  }

  /** Todos os campos obrigatórios têm confiança suficiente. */
  completo(): boolean {
    return (
      this.condicoesPagamento.extraido &&
      this.prazoValidade.extraido &&
      this.condicoesEntrega.extraido
    );
  }

  paraPayload(): CondicoesComerciaisPayload {
    const prazoValidade = this.prazoValidade.paraPayload();
    return {
      condicoesPagamento: this.condicoesPagamento.paraPayload(),
      prazoValidade: {
        ...prazoValidade,
        valor: prazoValidade.valor?.paraPayload() ?? null,
      },
      condicoesEntrega: this.condicoesEntrega.paraPayload(),
    };
  }
}
