import { ErroDominio } from '../errors/erro-dominio.js';
import type { AgenteOrigemDecisao } from './decisao-roteamento.vo.js';
import type { DecisaoRoteamento } from './decisao-roteamento.vo.js';

export class TentativaDecisaoWorkflowInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`TentativaDecisaoWorkflow inválida: ${mensagem}`);
  }
}

export interface TentativaDecisaoWorkflowProps {
  readonly agente: AgenteOrigemDecisao;
  readonly timestamp: Date;
  readonly resultado?: DecisaoRoteamento;
  readonly motivoInsucesso?: string;
}

/**
 * Entrada imutável do histórico append-only de `DecisaoWorkflow.historico`
 * (plan.md) — cada tentativa do Orquestrador ou decisão humana anexa uma
 * nova `TentativaDecisaoWorkflow`, nunca sobrescreve ou apaga uma anterior.
 * Exatamente um de `resultado` (decisão bem-sucedida) ou `motivoInsucesso`
 * (ex.: confiança insuficiente, escalonada a `PENDENTE_REVISAO_HUMANA`)
 * está presente — nunca ambos, nunca nenhum (mesmo padrão estrutural de
 * `TentativaIndexacao`, spec 004).
 */
export class TentativaDecisaoWorkflow {
  private constructor(
    readonly agente: AgenteOrigemDecisao,
    readonly timestamp: Date,
    readonly resultado: DecisaoRoteamento | undefined,
    readonly motivoInsucesso: string | undefined,
  ) {}

  static de(props: TentativaDecisaoWorkflowProps): TentativaDecisaoWorkflow {
    if (Number.isNaN(props.timestamp.getTime())) {
      throw new TentativaDecisaoWorkflowInvalidaError('timestamp inválido');
    }

    if (props.resultado !== undefined && props.motivoInsucesso !== undefined) {
      throw new TentativaDecisaoWorkflowInvalidaError(
        'resultado e motivoInsucesso são mutuamente exclusivos',
      );
    }

    if (props.resultado !== undefined) {
      return new TentativaDecisaoWorkflow(
        props.agente,
        props.timestamp,
        props.resultado,
        undefined,
      );
    }

    if (!props.motivoInsucesso?.trim()) {
      throw new TentativaDecisaoWorkflowInvalidaError(
        'ausência de resultado exige motivoInsucesso não vazio',
      );
    }

    return new TentativaDecisaoWorkflow(
      props.agente,
      props.timestamp,
      undefined,
      props.motivoInsucesso.trim(),
    );
  }
}
