import { ErroDominio } from './errors/erro-dominio.js';
import type { CondicoesComerciais } from './value-objects/condicoes-comerciais.vo.js';
import type { ItemOrcamento } from './value-objects/item-orcamento.vo.js';
import type { OrcamentoId } from './value-objects/orcamento-id.vo.js';
import type { ReferenciaClassificacao } from './value-objects/referencia-classificacao.vo.js';
import type { ReferenciaS3 } from './value-objects/referencia-s3.vo.js';
import { TentativaExtracao } from './value-objects/tentativa-extracao.vo.js';

export const STATUS_EXTRACAO = [
  'PENDENTE',
  'EXTRAIDO',
  'PENDENTE_REVISAO_HUMANA',
  'EXTRAIDO_COM_PENDENCIA_CONFIRMADA',
] as const;
export type StatusExtracao = (typeof STATUS_EXTRACAO)[number];

export class ReferenciaImutavelError extends ErroDominio {
  constructor(campo: string) {
    super(`"${campo}" não pode ser sobrescrito após a criação de ExtracaoOrcamento`);
  }
}

export class TransicaoInvalidaExtracaoError extends ErroDominio {
  constructor(statusAtual: StatusExtracao, acao: string) {
    super(`Transição inválida: "${acao}" a partir do status ${statusAtual}`);
  }
}

export interface ExtracaoOrcamentoProps {
  readonly orcamentoId: OrcamentoId;
  readonly referenciaClassificacao: ReferenciaClassificacao;
  readonly referenciaBrutaS3: ReferenciaS3;
  readonly status: StatusExtracao;
  readonly itens: readonly ItemOrcamento[];
  readonly condicoesComerciais?: CondicoesComerciais;
  readonly historico: readonly TentativaExtracao[];
}

/** Todos os itens e as condições comerciais têm todo campo obrigatório extraído. */
function completo(
  itens: readonly ItemOrcamento[],
  condicoesComerciais?: CondicoesComerciais,
): boolean {
  return (
    itens.length > 0 &&
    itens.every((item) => item.completo()) &&
    condicoesComerciais !== undefined &&
    condicoesComerciais.completo()
  );
}

/**
 * Agregado raiz do BC Extração — nunca reaproveita o agregado `Orcamento`
 * da Ingestão (plan.md). Nenhum campo é preenchido com valor inventado
 * (invariante estrutural em `CampoExtraido<T>`, aplicada aqui só na transição
 * de status, nunca reconstruindo/alterando o valor em si).
 */
export class ExtracaoOrcamento {
  private readonly _orcamentoId: OrcamentoId;
  private readonly _referenciaClassificacao: ReferenciaClassificacao;
  private readonly _referenciaBrutaS3: ReferenciaS3;
  private _status: StatusExtracao;
  private _itens: readonly ItemOrcamento[];
  private _condicoesComerciais: CondicoesComerciais | undefined;
  private readonly _historico: TentativaExtracao[];

  private constructor(props: ExtracaoOrcamentoProps) {
    this._orcamentoId = props.orcamentoId;
    this._referenciaClassificacao = props.referenciaClassificacao;
    this._referenciaBrutaS3 = props.referenciaBrutaS3;
    this._status = props.status;
    this._itens = props.itens;
    this._condicoesComerciais = props.condicoesComerciais;
    this._historico = [...props.historico];
  }

  /** Cria o agregado no momento em que `OrcamentoClassificado` é consumido. */
  static criar(
    orcamentoId: OrcamentoId,
    referenciaClassificacao: ReferenciaClassificacao,
    referenciaBrutaS3: ReferenciaS3,
  ): ExtracaoOrcamento {
    return new ExtracaoOrcamento({
      orcamentoId,
      referenciaClassificacao,
      referenciaBrutaS3,
      status: 'PENDENTE',
      itens: [],
      condicoesComerciais: undefined,
      historico: [],
    });
  }

  /** Reconstrói o agregado a partir de estado persistido (uso do repositório). */
  static reconstituir(props: ExtracaoOrcamentoProps): ExtracaoOrcamento {
    return new ExtracaoOrcamento(props);
  }

  get orcamentoId(): OrcamentoId {
    return this._orcamentoId;
  }

  get referenciaClassificacao(): ReferenciaClassificacao {
    return this._referenciaClassificacao;
  }

  get referenciaBrutaS3(): ReferenciaS3 {
    return this._referenciaBrutaS3;
  }

  get status(): StatusExtracao {
    return this._status;
  }

  get itens(): readonly ItemOrcamento[] {
    return this._itens;
  }

  get condicoesComerciais(): CondicoesComerciais | undefined {
    return this._condicoesComerciais;
  }

  get historico(): readonly TentativaExtracao[] {
    return this._historico;
  }

  /** Nenhum código deste contexto pode sobrescrever a referência à classificação (Princípio III). */
  atualizarReferenciaClassificacao(): never {
    throw new ReferenciaImutavelError('referenciaClassificacao');
  }

  /** Nenhum código deste contexto pode sobrescrever a referência ao dado bruto (Princípio III). */
  atualizarReferenciaBrutaS3(): never {
    throw new ReferenciaImutavelError('referenciaBrutaS3');
  }

  /**
   * Registra a (única) tentativa do Agente Extrator. Todo campo obrigatório
   * com confiança suficiente transita para `EXTRAIDO`; 1+ campo obrigatório
   * sem confiança transita direto para `PENDENTE_REVISAO_HUMANA` — nunca há
   * reprocessamento automático por IA (ADR-003).
   */
  registrarTentativaExtrator(
    itens: readonly ItemOrcamento[],
    condicoesComerciais: CondicoesComerciais,
  ): void {
    if (this._status !== 'PENDENTE') {
      throw new TransicaoInvalidaExtracaoError(this._status, 'registrarTentativaExtrator');
    }
    this._itens = itens;
    this._condicoesComerciais = condicoesComerciais;

    if (completo(itens, condicoesComerciais)) {
      this._historico.push(TentativaExtracao.sucesso('EXTRATOR', 'EXTRAIDO'));
      this._status = 'EXTRAIDO';
    } else {
      this._historico.push(
        TentativaExtracao.insucesso('EXTRATOR', '1+ campo obrigatório sem confiança suficiente'),
      );
      this._status = 'PENDENTE_REVISAO_HUMANA';
    }
  }

  /**
   * Confirmação humana explícita — só válida a partir de
   * `PENDENTE_REVISAO_HUMANA`. Valor real completa o campo pendente
   * (`EXTRAIDO`); indisponibilidade confirmada é decisão definitiva, não
   * falha (`EXTRAIDO_COM_PENDENCIA_CONFIRMADA`). Nunca apaga histórico.
   */
  registrarConfirmacaoHumana(
    itens: readonly ItemOrcamento[],
    condicoesComerciais: CondicoesComerciais,
  ): void {
    if (this._status !== 'PENDENTE_REVISAO_HUMANA') {
      throw new TransicaoInvalidaExtracaoError(this._status, 'registrarConfirmacaoHumana');
    }
    this._itens = itens;
    this._condicoesComerciais = condicoesComerciais;

    if (completo(itens, condicoesComerciais)) {
      this._historico.push(TentativaExtracao.sucesso('HUMANO', 'EXTRAIDO'));
      this._status = 'EXTRAIDO';
    } else {
      this._historico.push(
        TentativaExtracao.sucesso('HUMANO', 'EXTRAIDO_COM_PENDENCIA_CONFIRMADA'),
      );
      this._status = 'EXTRAIDO_COM_PENDENCIA_CONFIRMADA';
    }
  }
}
