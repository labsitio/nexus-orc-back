import { ErroDominio } from '../errors/erro-dominio.js';

export const VALORES_STATUS_SOLICITACAO = [
  'REGISTRADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'PRAZO_EXCEDIDO',
] as const;

export type StatusSolicitacaoValor = (typeof VALORES_STATUS_SOLICITACAO)[number];

export class StatusSolicitacaoInvalidoError extends ErroDominio {
  constructor(valor: string) {
    super(
      `StatusSolicitacao inválido: "${valor}" — valores aceitos: ${VALORES_STATUS_SOLICITACAO.join(', ')}`,
    );
  }
}

/**
 * Enum fechado do status do agregado `SolicitacaoEsquecimento` (plan.md,
 * seção Agregado). `CONCLUIDA` e `PRAZO_EXCEDIDO` são terminais: nenhuma
 * transição de negócio parte deles de volta para `REGISTRADA`/`EM_ANDAMENTO`.
 */
export class StatusSolicitacao {
  private constructor(readonly valor: StatusSolicitacaoValor) {}

  static de(valor: string): StatusSolicitacao {
    if (!VALORES_STATUS_SOLICITACAO.includes(valor as StatusSolicitacaoValor)) {
      throw new StatusSolicitacaoInvalidoError(valor);
    }
    return new StatusSolicitacao(valor as StatusSolicitacaoValor);
  }

  static registrada(): StatusSolicitacao {
    return new StatusSolicitacao('REGISTRADA');
  }

  static emAndamento(): StatusSolicitacao {
    return new StatusSolicitacao('EM_ANDAMENTO');
  }

  static concluida(): StatusSolicitacao {
    return new StatusSolicitacao('CONCLUIDA');
  }

  static prazoExcedido(): StatusSolicitacao {
    return new StatusSolicitacao('PRAZO_EXCEDIDO');
  }

  igual(outro: StatusSolicitacao): boolean {
    return this.valor === outro.valor;
  }
}
