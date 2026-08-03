import { ErroDominio } from '../errors/erro-dominio.js';

export class ContextoExtracaoInvalidoError extends ErroDominio {
  constructor(campo: string) {
    super(`ContextoExtracao inválido: "${campo}" não pode ser vazio`);
  }
}

export interface ContextoExtracaoParams {
  readonly itensResumo: string;
  readonly condicoesComerciaisResumo: string;
  readonly houvePendenciaConfirmada: boolean;
}

/**
 * Cópia imutável traduzida do payload de `OrcamentoExtraido`/
 * `OrcamentoExtraidoComPendenciaConfirmada` (spec 002), criada
 * exclusivamente pelo `OrcamentoExtraidoEventACL` — nunca referência viva
 * ao agregado de Extração (fronteira de Bounded Context, plan.md).
 * Deliberadamente um resumo textual, não os itens/condições completos:
 * Orquestração só precisa de contexto suficiente para a decisão de
 * roteamento, não da estrutura de negócio de outro BC (contrato exato do
 * resumo é risco remanescente registrado em `plan.md`/T056).
 */
export class ContextoExtracao {
  private constructor(
    readonly itensResumo: string,
    readonly condicoesComerciaisResumo: string,
    readonly houvePendenciaConfirmada: boolean,
  ) {}

  static de(params: ContextoExtracaoParams): ContextoExtracao {
    if (!params.itensResumo.trim()) {
      throw new ContextoExtracaoInvalidoError('itensResumo');
    }
    if (!params.condicoesComerciaisResumo.trim()) {
      throw new ContextoExtracaoInvalidoError('condicoesComerciaisResumo');
    }
    return new ContextoExtracao(
      params.itensResumo.trim(),
      params.condicoesComerciaisResumo.trim(),
      params.houvePendenciaConfirmada,
    );
  }

  equals(outro: ContextoExtracao): boolean {
    return (
      this.itensResumo === outro.itensResumo &&
      this.condicoesComerciaisResumo === outro.condicoesComerciaisResumo &&
      this.houvePendenciaConfirmada === outro.houvePendenciaConfirmada
    );
  }
}
