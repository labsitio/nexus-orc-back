import { ErroDominio } from '../errors/erro-dominio.js';
import { ConteudoIndexavel } from '../value-objects/conteudo-indexavel.vo.js';
import { Embedding } from '../value-objects/embedding.vo.js';
import { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../value-objects/origem-validacao.vo.js';
import { TentativaIndexacao } from '../value-objects/tentativa-indexacao.vo.js';

export class OrigemValidacaoImutavelError extends ErroDominio {
  constructor(campo: string) {
    super(`IndiceOrcamento: campo '${campo}' é imutável fora do construtor de criação`);
  }
}

export class IndiceOrcamentoInconsistenteError extends ErroDominio {
  constructor(mensagem: string) {
    super(`IndiceOrcamento inconsistente: ${mensagem}`);
  }
}

export const ESTADOS_INDEXACAO = ['PENDENTE', 'INDEXADO', 'FALHA_INDEXACAO'] as const;

export type EstadoIndexacao = (typeof ESTADOS_INDEXACAO)[number];

export interface IndiceOrcamentoProps {
  readonly orcamentoId: OrcamentoId;
  readonly conteudoIndexavel: ConteudoIndexavel;
  readonly origemValidacao: OrigemValidacao;
}

export interface IndiceOrcamentoReconstituirProps extends IndiceOrcamentoProps {
  readonly estado: EstadoIndexacao;
  readonly embedding: Embedding | undefined;
  readonly historico: readonly TentativaIndexacao[];
}

export type RegistrarTentativaIndexacaoParams =
  | { readonly resultado: 'INDEXADO'; readonly timestamp: Date; readonly embedding: Embedding }
  | { readonly resultado: 'FALHA_TECNICA'; readonly timestamp: Date; readonly motivoFalha: string };

/**
 * Agregado raiz do BC Busca & Indexação (plan.md). Identidade correlata a
 * `OrcamentoId` (mesmo valor gerado pela Ingestão, spec 001) — este BC nunca
 * gera um novo identificador, apenas reutiliza.
 *
 * `conteudoIndexavel`/`origemValidacao` são imutáveis fora do construtor de
 * criação (ADR-004 do plan.md): qualquer tentativa de sobrescrita lança
 * `OrigemValidacaoImutavelError`.
 *
 * Retry de indexação não tem limite estrutural no Domain (ADR-002) — o
 * limite é responsabilidade de infraestrutura (SQS `maxReceiveCount` + DLQ +
 * alarme). Uma chamada a `registrarTentativaIndexacao` a partir de
 * `FALHA_INDEXACAO` é sempre uma transição válida.
 */
export class IndiceOrcamento {
  private _historico: TentativaIndexacao[] = [];
  private _estado: EstadoIndexacao = 'PENDENTE';
  private _embedding: Embedding | undefined;

  private constructor(
    readonly orcamentoId: OrcamentoId,
    private readonly _conteudoIndexavel: ConteudoIndexavel,
    private readonly _origemValidacao: OrigemValidacao,
  ) {}

  /** Cria um novo agregado a partir do payload traduzido pelo `OrcamentoValidadoEventACL`. */
  static criar(props: IndiceOrcamentoProps): IndiceOrcamento {
    return new IndiceOrcamento(props.orcamentoId, props.conteudoIndexavel, props.origemValidacao);
  }

  /** Reidrata o agregado a partir de estado já persistido (Infrastructure) — revalida a invariante crítica antes de aceitar a reidratação. */
  static reconstituir(props: IndiceOrcamentoReconstituirProps): IndiceOrcamento {
    if (props.estado === 'INDEXADO' && !props.embedding) {
      throw new IndiceOrcamentoInconsistenteError('estado INDEXADO reidratado sem embedding');
    }

    const indice = new IndiceOrcamento(
      props.orcamentoId,
      props.conteudoIndexavel,
      props.origemValidacao,
    );
    indice._estado = props.estado;
    indice._embedding = props.embedding;
    indice._historico = [...props.historico];
    return indice;
  }

  get conteudoIndexavel(): ConteudoIndexavel {
    return this._conteudoIndexavel;
  }

  set conteudoIndexavel(_valor: ConteudoIndexavel) {
    throw new OrigemValidacaoImutavelError('conteudoIndexavel');
  }

  get origemValidacao(): OrigemValidacao {
    return this._origemValidacao;
  }

  set origemValidacao(_valor: OrigemValidacao) {
    throw new OrigemValidacaoImutavelError('origemValidacao');
  }

  get estado(): EstadoIndexacao {
    return this._estado;
  }

  get embedding(): Embedding | undefined {
    return this._embedding;
  }

  /** Histórico append-only — cópia defensiva, nunca expõe o array mutável interno. */
  get historico(): readonly TentativaIndexacao[] {
    return [...this._historico];
  }

  /**
   * Anexa uma nova tentativa ao histórico (nunca sobrescreve/apaga uma
   * anterior). Só transita para `INDEXADO` quando `embedding` é fornecido na
   * mesma chamada — nunca existe "indexado parcialmente". Delega a
   * validação estrutural da tentativa a `TentativaIndexacao.de`, então um
   * `embedding` ausente ao forçar `INDEXADO` já propaga como erro de
   * domínio antes de qualquer mutação de estado.
   */
  registrarTentativaIndexacao(params: RegistrarTentativaIndexacaoParams): void {
    if (params.resultado === 'INDEXADO') {
      const embeddingRecebido = params.embedding as Embedding | undefined;
      const tentativa = TentativaIndexacao.de({
        resultado: 'INDEXADO',
        timestamp: params.timestamp,
        modeloEmbedding: embeddingRecebido?.modeloId,
      });
      this._historico.push(tentativa);
      this._embedding = embeddingRecebido;
      this._estado = 'INDEXADO';
      return;
    }

    const tentativa = TentativaIndexacao.de({
      resultado: 'FALHA_TECNICA',
      timestamp: params.timestamp,
      motivoFalha: params.motivoFalha as string | undefined,
    });
    this._historico.push(tentativa);
    this._estado = 'FALHA_INDEXACAO';
  }
}
