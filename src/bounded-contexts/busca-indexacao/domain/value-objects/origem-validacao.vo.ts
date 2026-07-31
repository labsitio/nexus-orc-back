import { ErroDominio } from '../errors/erro-dominio.js';

export class OrigemValidacaoInvalidaError extends ErroDominio {
  constructor(valor: string) {
    super(
      `OrigemValidacao inválida: '${valor}' — valores aceitos: VALIDADO, VALIDADO_COM_RESSALVA`,
    );
  }
}

export type OrigemValidacaoValor = 'VALIDADO' | 'VALIDADO_COM_RESSALVA';

const VALORES_VALIDOS: readonly OrigemValidacaoValor[] = ['VALIDADO', 'VALIDADO_COM_RESSALVA'];

/**
 * Enum fechado da origem do orçamento indexado — de qual evento upstream
 * (`OrcamentoValidado` ou `OrcamentoValidadoComRessalva`) ele chegou.
 * Preservado no agregado `IndiceOrcamento` para nunca omitir do índice um
 * orçamento "validado com ressalva": para efeito de disponibilidade de
 * negócio ambos são orçamentos que o gestor de compras já pode usar — não é
 * uma hierarquia de "menos válido" (ver ADR-004, plan.md).
 */
export class OrigemValidacao {
  private constructor(readonly valor: OrigemValidacaoValor) {}

  static de(valor: string): OrigemValidacao {
    if (!VALORES_VALIDOS.includes(valor as OrigemValidacaoValor)) {
      throw new OrigemValidacaoInvalidaError(valor);
    }
    return new OrigemValidacao(valor as OrigemValidacaoValor);
  }

  igual(outra: OrigemValidacao): boolean {
    return this.valor === outra.valor;
  }
}
