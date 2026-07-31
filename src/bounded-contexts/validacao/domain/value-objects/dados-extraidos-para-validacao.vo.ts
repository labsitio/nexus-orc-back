import { CNPJ } from './cnpj.vo.js';
import { ItemParaValidacao } from './item-para-validacao.vo.js';
import { PeriodoValidade } from './periodo-validade.vo.js';
import { ErroDominio } from '../errors/erro-dominio.js';

export class DadosExtraidosParaValidacaoInvalidosError extends ErroDominio {
  constructor(mensagem: string) {
    super(`DadosExtraidosParaValidacao inválidos: ${mensagem}`);
  }
}

export interface DadosExtraidosParaValidacaoProps {
  readonly cnpjFornecedor: CNPJ;
  readonly itens: readonly ItemParaValidacao[];
  readonly condicoesComerciais: string;
  readonly dataEmissaoProposta: Date;
  readonly periodoValidade: PeriodoValidade;
}

/**
 * Cópia imutável traduzida do payload de `OrcamentoExtraido`/
 * `OrcamentoExtraidoComPendenciaConfirmada`, criada exclusivamente pelo
 * `OrcamentoExtraidoEventACL` — nunca referência viva ao agregado da
 * Extração (fronteira de Bounded Context).
 */
export class DadosExtraidosParaValidacao {
  private constructor(
    readonly cnpjFornecedor: CNPJ,
    readonly itens: readonly ItemParaValidacao[],
    readonly condicoesComerciais: string,
    readonly dataEmissaoProposta: Date,
    readonly periodoValidade: PeriodoValidade,
  ) {}

  static de(props: DadosExtraidosParaValidacaoProps): DadosExtraidosParaValidacao {
    if (props.itens.length === 0) {
      throw new DadosExtraidosParaValidacaoInvalidosError('itens não pode ser vazio');
    }
    if (Number.isNaN(props.dataEmissaoProposta.getTime())) {
      throw new DadosExtraidosParaValidacaoInvalidosError('dataEmissaoProposta inválida');
    }
    return new DadosExtraidosParaValidacao(
      props.cnpjFornecedor,
      props.itens,
      props.condicoesComerciais,
      props.dataEmissaoProposta,
      props.periodoValidade,
    );
  }
}
