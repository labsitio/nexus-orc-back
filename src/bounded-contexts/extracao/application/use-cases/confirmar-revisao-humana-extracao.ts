import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import { ErroDominio } from '../../domain/errors/erro-dominio.js';
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
import type { ExtracaoOrcamentoRepository } from '../../domain/repositories/extracao-orcamento.repository.js';

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

const ITEM_CAMINHO_RE = /^itens\[(\d+)\]\.(descricao|quantidade|precoUnitario)$/;
const CONDICOES_CAMINHO_RE =
  /^condicoesComerciais\.(condicoesPagamento|prazoValidade|condicoesEntrega)$/;

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
    case 'descricao': {
      exigirNaoExtraido(item.descricao, campoConfirmado.caminho);
      const valor = campoConfirmado.valor as { descricao: string; sku?: string };
      return {
        ...item,
        descricao: campoExtraidoOuIndisponivel(campoConfirmado, () =>
          DescricaoProduto.de(valor.descricao, valor.sku),
        ),
      };
    }
    case 'quantidade': {
      exigirNaoExtraido(item.quantidade, campoConfirmado.caminho);
      const valor = campoConfirmado.valor as number;
      return {
        ...item,
        quantidade: campoExtraidoOuIndisponivel(campoConfirmado, () => Quantidade.de(valor)),
      };
    }
    case 'precoUnitario': {
      exigirNaoExtraido(item.precoUnitario, campoConfirmado.caminho);
      const valor = campoConfirmado.valor as { valorCentavos: number; moeda: string };
      return {
        ...item,
        precoUnitario: campoExtraidoOuIndisponivel(campoConfirmado, () =>
          Dinheiro.de(valor.valorCentavos, valor.moeda),
        ),
      };
    }
  }
}

/** Mesma lógica de `aplicarConfirmacaoItem`, para `condicoesComerciais`. */
function aplicarConfirmacaoCondicoes(
  condicoes: CondicoesComerciaisParams,
  campo: 'condicoesPagamento' | 'prazoValidade' | 'condicoesEntrega',
  campoConfirmado: CampoConfirmadoParams,
): CondicoesComerciaisParams {
  switch (campo) {
    case 'condicoesPagamento': {
      exigirNaoExtraido(condicoes.condicoesPagamento, campoConfirmado.caminho);
      const valor = campoConfirmado.valor as string;
      return {
        ...condicoes,
        condicoesPagamento: campoExtraidoOuIndisponivel(campoConfirmado, () => valor),
      };
    }
    case 'condicoesEntrega': {
      exigirNaoExtraido(condicoes.condicoesEntrega, campoConfirmado.caminho);
      const valor = campoConfirmado.valor as string;
      return {
        ...condicoes,
        condicoesEntrega: campoExtraidoOuIndisponivel(campoConfirmado, () => valor),
      };
    }
    case 'prazoValidade': {
      exigirNaoExtraido(condicoes.prazoValidade, campoConfirmado.caminho);
      const valor = campoConfirmado.valor as string;
      return {
        ...condicoes,
        prazoValidade: campoExtraidoOuIndisponivel(campoConfirmado, () =>
          PeriodoValidade.de(new Date(valor)),
        ),
      };
    }
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
    private readonly repositorio: ExtracaoOrcamentoRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async executar(params: ConfirmarRevisaoHumanaExtracaoParams): Promise<void> {
    const orcamentoId = OrcamentoId.de(params.orcamentoId);
    const extracao = await this.repositorio.buscarPorOrcamentoId(orcamentoId);
    if (!extracao) {
      throw new ExtracaoNaoEncontradaError(params.orcamentoId);
    }

    const condicoesAtuais = extracao.condicoesComerciais;
    if (!condicoesAtuais) {
      throw new CaminhoConfirmacaoInvalidoError(
        'condicoesComerciais',
        'extração sem condições comerciais registradas — nenhuma tentativa do Extrator ainda',
      );
    }

    const { itens, condicoesComerciais } = aplicarConfirmacoes(
      extracao.itens,
      condicoesAtuais,
      params.camposConfirmados,
    );

    extracao.registrarConfirmacaoHumana(itens, condicoesComerciais);
    await this.repositorio.salvar(extracao);

    const evento =
      extracao.status === 'EXTRAIDO'
        ? new OrcamentoExtraido(
            extracao.orcamentoId.toString(),
            extracao.itens.map((item) => item.paraPayload()),
            condicoesComerciais.paraPayload(),
          )
        : new OrcamentoExtraidoComPendenciaConfirmada(
            extracao.orcamentoId.toString(),
            extracao.itens.map((item) => item.paraPayload()),
            condicoesComerciais.paraPayload(),
          );
    await this.eventPublisher.publicar(evento);
  }
}
