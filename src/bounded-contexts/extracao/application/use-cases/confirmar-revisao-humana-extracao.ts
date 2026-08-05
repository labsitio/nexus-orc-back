import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import type {
  ExtracaoOrcamento,
  StatusExtracao,
} from '../../domain/extracao-orcamento.aggregate.js';
import { TransicaoInvalidaExtracaoError } from '../../domain/extracao-orcamento.aggregate.js';
import { OrcamentoExtraido } from '../../domain/events/orcamento-extraido.event.js';
import { OrcamentoExtraidoComPendenciaConfirmada } from '../../domain/events/orcamento-extraido-pendencia-confirmada.event.js';
import { CampoExtraido } from '../../domain/value-objects/campo-extraido.vo.js';
import {
  CondicoesComerciais,
  type CondicoesComerciaisParams,
} from '../../domain/value-objects/condicoes-comerciais.vo.js';
import { DescricaoProduto } from '../../domain/value-objects/descricao-produto.vo.js';
import { Dinheiro } from '../../domain/value-objects/dinheiro.vo.js';
import {
  ItemOrcamento,
  type ItemOrcamentoParams,
} from '../../domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../../domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../../domain/value-objects/periodo-validade.vo.js';
import { Quantidade } from '../../domain/value-objects/quantidade.vo.js';
import type { CriarExtracaoOrcamentoRepositorio } from '../../domain/repositories/extracao-orcamento.repository.js';
import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import { TenantDivergenciaError } from './consultar-status-extracao.js';

/** Confiança atribuída à decisão humana — nunca a confiança de uma extração automática. */
const CONFIANCA_DECISAO_HUMANA = NivelConfianca.de(100);

export interface CampoConfirmadoParams {
  /** Ex.: `itens[0].precoUnitario`, `condicoesComerciais.prazoValidade` (plan.md/T037). */
  readonly caminho: string;
  /** Ignorado quando `indisponivel === true`. Shape depende do campo (ver `resolverValor`). */
  readonly valor: unknown;
  readonly indisponivel: boolean;
}

export interface ConfirmarRevisaoHumanaExtracaoParams {
  readonly orcamentoId: string;
  readonly camposConfirmados: readonly CampoConfirmadoParams[];
  /**
   * (issue #656) Vem sempre do `TenantContext` já validado (JWT Cognito no
   * controller HTTP) — nunca do body da requisição (mesmo padrão de
   * `ConfirmarRevisaoHumanaParams`, BC Ingestão & Identificação).
   */
  readonly tenantId: TenantId;
}

export class ExtracaoNaoEncontradaError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`ExtracaoOrcamento não encontrada para orcamentoId ${orcamentoId}`);
  }
}

export class CaminhoConfirmacaoInvalidoError extends ErroDominio {
  constructor(caminho: string, motivo: string) {
    super(`Caminho de confirmação "${caminho}" inválido: ${motivo}`);
  }
}

/** Nunca deveria ocorrer — invariante do agregado (T009): status só chega a
 * `PENDENTE_REVISAO_HUMANA` depois de `registrarTentativaExtrator` já ter
 * preenchido `condicoesComerciais`. */
export class ExtracaoSemCondicoesComerciaisError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(
      `ExtracaoOrcamento ${orcamentoId} está PENDENTE_REVISAO_HUMANA sem condicoesComerciais — invariante do agregado violada`,
    );
  }
}

const ITEM_CAMINHO_RE = /^itens\[(\d+)\]\.(descricao|quantidade|precoUnitario)$/;
const CONDICOES_CAMINHO_RE =
  /^condicoesComerciais\.(condicoesPagamento|prazoValidade|condicoesEntrega)$/;

/** Shape de `valor` da borda (Zod: `z.unknown()`) — nunca confiar sem checar antes do VO. */
function comoObjeto(valor: unknown, caminho: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new CaminhoConfirmacaoInvalidoError(caminho, 'valor esperado é um objeto');
  }
  return valor as Record<string, unknown>;
}

function comoString(valor: unknown, caminho: string): string {
  if (typeof valor !== 'string') {
    throw new CaminhoConfirmacaoInvalidoError(caminho, 'valor esperado é uma string');
  }
  return valor;
}

function comoStringOpcional(valor: unknown, caminho: string): string | undefined {
  return valor === undefined ? undefined : comoString(valor, caminho);
}

function comoNumero(valor: unknown, caminho: string): number {
  if (typeof valor !== 'number') {
    throw new CaminhoConfirmacaoInvalidoError(caminho, 'valor esperado é um number');
  }
  return valor;
}

function resolverDescricaoProduto(valor: unknown, caminho: string): DescricaoProduto {
  const obj = comoObjeto(valor, caminho);
  return DescricaoProduto.de(
    comoString(obj.descricao, caminho),
    comoStringOpcional(obj.sku, caminho),
  );
}

function resolverDinheiro(valor: unknown, caminho: string): Dinheiro {
  const obj = comoObjeto(valor, caminho);
  return Dinheiro.de(comoNumero(obj.valorCentavos, caminho), comoString(obj.moeda, caminho));
}

/**
 * `ExtracaoOrcamento.status` é um getter sem setter — o TS trata leitura
 * direta (`extracao.status`) como narrowable e não invalida o narrowing após
 * chamadas de método que mutam o agregado (`registrarConfirmacaoHumana`).
 * Indireção via função evita o narrowing indevido.
 */
function statusDe(extracao: ExtracaoOrcamento): StatusExtracao {
  return extracao.status;
}

function campoExtraidoOuIndisponivel<T>(
  campoConfirmado: CampoConfirmadoParams,
  valorResolvido: () => T,
): CampoExtraido<T> {
  return campoConfirmado.indisponivel
    ? CampoExtraido.naoExtraido<T>(CONFIANCA_DECISAO_HUMANA, 'HUMANO')
    : CampoExtraido.extraido<T>(valorResolvido(), CONFIANCA_DECISAO_HUMANA, 'HUMANO');
}

function exigirNaoExtraido(campoAtual: CampoExtraido<unknown>, caminho: string): void {
  if (campoAtual.extraido) {
    throw new CaminhoConfirmacaoInvalidoError(
      caminho,
      'campo já extraído com sucesso — nunca reaberto por confirmação humana',
    );
  }
}

/**
 * Aplica um `campoConfirmado` a um item — um `switch` por campo evita cast
 * inseguro entre o shape de `valor` (borda) e o VO de domínio esperado.
 */
function aplicarConfirmacaoItem(
  item: ItemOrcamentoParams,
  campo: 'descricao' | 'quantidade' | 'precoUnitario',
  campoConfirmado: CampoConfirmadoParams,
): ItemOrcamentoParams {
  switch (campo) {
    case 'descricao':
      exigirNaoExtraido(item.descricao, campoConfirmado.caminho);
      return {
        ...item,
        descricao: campoExtraidoOuIndisponivel(campoConfirmado, () =>
          resolverDescricaoProduto(campoConfirmado.valor, campoConfirmado.caminho),
        ),
      };
    case 'quantidade':
      exigirNaoExtraido(item.quantidade, campoConfirmado.caminho);
      return {
        ...item,
        quantidade: campoExtraidoOuIndisponivel(campoConfirmado, () =>
          Quantidade.de(comoNumero(campoConfirmado.valor, campoConfirmado.caminho)),
        ),
      };
    case 'precoUnitario':
      exigirNaoExtraido(item.precoUnitario, campoConfirmado.caminho);
      return {
        ...item,
        precoUnitario: campoExtraidoOuIndisponivel(campoConfirmado, () =>
          resolverDinheiro(campoConfirmado.valor, campoConfirmado.caminho),
        ),
      };
  }
}

/** Mesma lógica de `aplicarConfirmacaoItem`, para `condicoesComerciais`. */
function aplicarConfirmacaoCondicoes(
  condicoes: CondicoesComerciaisParams,
  campo: 'condicoesPagamento' | 'prazoValidade' | 'condicoesEntrega',
  campoConfirmado: CampoConfirmadoParams,
): CondicoesComerciaisParams {
  switch (campo) {
    case 'condicoesPagamento':
      exigirNaoExtraido(condicoes.condicoesPagamento, campoConfirmado.caminho);
      return {
        ...condicoes,
        condicoesPagamento: campoExtraidoOuIndisponivel(campoConfirmado, () =>
          comoString(campoConfirmado.valor, campoConfirmado.caminho),
        ),
      };
    case 'condicoesEntrega':
      exigirNaoExtraido(condicoes.condicoesEntrega, campoConfirmado.caminho);
      return {
        ...condicoes,
        condicoesEntrega: campoExtraidoOuIndisponivel(campoConfirmado, () =>
          comoString(campoConfirmado.valor, campoConfirmado.caminho),
        ),
      };
    case 'prazoValidade':
      exigirNaoExtraido(condicoes.prazoValidade, campoConfirmado.caminho);
      return {
        ...condicoes,
        prazoValidade: campoExtraidoOuIndisponivel(campoConfirmado, () => {
          const iso = comoString(campoConfirmado.valor, campoConfirmado.caminho);
          const data = new Date(iso);
          if (Number.isNaN(data.getTime())) {
            throw new CaminhoConfirmacaoInvalidoError(
              campoConfirmado.caminho,
              'valor esperado é uma data ISO 8601 válida',
            );
          }
          return PeriodoValidade.de(data);
        }),
      };
  }
}

/**
 * Aplica `camposConfirmados` (path-based, contrato fixado em T037) sobre os
 * `itens`/`condicoesComerciais` atuais do agregado — nunca reabre campo já
 * `extraido: true` (plan.md: "nunca reabre campo já extraído com sucesso"),
 * apenas substitui os campos ainda pendentes (`extraido: false`) referenciados
 * pelo humano.
 */
function aplicarConfirmacoes(
  itensAtuais: readonly ItemOrcamento[],
  condicoesAtuais: CondicoesComerciais,
  camposConfirmados: readonly CampoConfirmadoParams[],
): { itens: readonly ItemOrcamento[]; condicoesComerciais: CondicoesComerciais } {
  let itens: ItemOrcamentoParams[] = itensAtuais.map((item) => ({
    descricao: item.descricao,
    quantidade: item.quantidade,
    precoUnitario: item.precoUnitario,
  }));
  let condicoes: CondicoesComerciaisParams = {
    condicoesPagamento: condicoesAtuais.condicoesPagamento,
    prazoValidade: condicoesAtuais.prazoValidade,
    condicoesEntrega: condicoesAtuais.condicoesEntrega,
  };

  for (const campoConfirmado of camposConfirmados) {
    const matchItem = ITEM_CAMINHO_RE.exec(campoConfirmado.caminho);
    if (matchItem) {
      const indice = Number(matchItem[1]);
      const campo = matchItem[2] as 'descricao' | 'quantidade' | 'precoUnitario';
      const item = itens[indice];
      if (!item) {
        throw new CaminhoConfirmacaoInvalidoError(
          campoConfirmado.caminho,
          `índice ${indice} fora do intervalo de itens (${itens.length})`,
        );
      }
      const itemAtualizado = aplicarConfirmacaoItem(item, campo, campoConfirmado);
      itens = itens.map((i, idx) => (idx === indice ? itemAtualizado : i));
      continue;
    }

    const matchCondicoes = CONDICOES_CAMINHO_RE.exec(campoConfirmado.caminho);
    if (matchCondicoes) {
      const campo = matchCondicoes[1] as
        'condicoesPagamento' | 'prazoValidade' | 'condicoesEntrega';
      condicoes = aplicarConfirmacaoCondicoes(condicoes, campo, campoConfirmado);
      continue;
    }

    throw new CaminhoConfirmacaoInvalidoError(
      campoConfirmado.caminho,
      'formato esperado: "itens[N].<campo>" ou "condicoesComerciais.<campo>"',
    );
  }

  return {
    itens: itens.map((i) => ItemOrcamento.de(i)),
    condicoesComerciais: CondicoesComerciais.de(condicoes),
  };
}

/**
 * Caso de uso síncrono acionado pelo endpoint REST de confirmação humana
 * (T039). Valida que o agregado está em `PENDENTE_REVISAO_HUMANA` (delegado
 * ao próprio agregado — `TransicaoInvalidaExtracaoError` se não estiver),
 * aplica `registrarConfirmacaoHumana` e publica `OrcamentoExtraido` (todos os
 * campos pendentes receberam valor real) ou `OrcamentoExtraidoComPendenciaConfirmada`
 * (1+ campo confirmado como indisponível) — nunca decide o evento fora da
 * regra do agregado (plan.md).
 */
export class ConfirmarRevisaoHumanaExtracao {
  constructor(
    private readonly criarRepositorio: CriarExtracaoOrcamentoRepositorio,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(params: ConfirmarRevisaoHumanaExtracaoParams): Promise<ExtracaoOrcamento> {
    const orcamentoId = OrcamentoId.de(params.orcamentoId);
    // (issue #656) Repositório construído por chamada a partir do `tenantId`
    // já validado do parâmetro — nunca reaproveitado como campo fixo entre
    // chamadas (ver `CriarExtracaoOrcamentoRepositorio`).
    const repositorio = this.criarRepositorio(params.tenantId);
    const extracao = await repositorio.buscarPorOrcamentoId(orcamentoId);
    if (!extracao) {
      throw new ExtracaoNaoEncontradaError(params.orcamentoId);
    }

    // (issue #656) Defesa em profundidade — ver `TenantDivergenciaError`.
    if (extracao.tenantId.toString() !== params.tenantId.toString()) {
      throw new TenantDivergenciaError(params.orcamentoId);
    }

    if (statusDe(extracao) !== 'PENDENTE_REVISAO_HUMANA') {
      throw new TransicaoInvalidaExtracaoError(statusDe(extracao), 'registrarConfirmacaoHumana');
    }

    const condicoesAtuais = extracao.condicoesComerciais;
    if (!condicoesAtuais) {
      throw new ExtracaoSemCondicoesComerciaisError(params.orcamentoId);
    }

    // (issue #656 — aperto de tipo) `ExtracaoOrcamento.tenantId` é obrigatório
    // desde a criação — capturado antes de `registrarConfirmacaoHumana` mutar
    // o agregado por consistência com o padrão de `statusDe` (getter perde
    // narrowing após chamada de método mutável).
    const tenantId = extracao.tenantId;

    const { itens, condicoesComerciais } = aplicarConfirmacoes(
      extracao.itens,
      condicoesAtuais,
      params.camposConfirmados,
    );

    extracao.registrarConfirmacaoHumana(itens, condicoesComerciais);
    await repositorio.salvar(extracao);

    const evento =
      statusDe(extracao) === 'EXTRAIDO'
        ? new OrcamentoExtraido(
            extracao.orcamentoId.toString(),
            extracao.itens.map((item) => item.paraPayload()),
            condicoesComerciais.paraPayload(),
            tenantId.toString(),
          )
        : new OrcamentoExtraidoComPendenciaConfirmada(
            extracao.orcamentoId.toString(),
            extracao.itens.map((item) => item.paraPayload()),
            condicoesComerciais.paraPayload(),
            tenantId.toString(),
          );
    await this.eventPublisher.publicar(evento);

    return extracao;
  }
}
