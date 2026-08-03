import { ErroDominio } from '../domain/errors/erro-dominio.js';
import { ConteudoIndexavel } from '../domain/value-objects/conteudo-indexavel.vo.js';
import { OrcamentoId } from '../domain/value-objects/orcamento-id.vo.js';
import { OrigemValidacao } from '../domain/value-objects/origem-validacao.vo.js';
import type {
  OrcamentoValidadoEventACL as OrcamentoValidadoEventACLPort,
  OrcamentoValidadoEventACLResultado,
  OrcamentoValidadoEventDetailType,
} from '../domain/gateways/orcamento-validado-event.acl.js';

export class OrcamentoValidadoEventACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`OrcamentoValidadoEventACL: payload inválido — ${mensagem}`);
  }
}

/**
 * Shape esperado (contrato de wire, não tipo de domínio) do item dentro de
 * `itens` no payload de `OrcamentoValidado`/`OrcamentoValidadoComRessalva`
 * (`ItemParaValidacaoPayload` do BC Validação, replicado aqui apenas como
 * shape estrutural — nunca importado do BC Validação, fronteira de Bounded
 * Context, plan.md).
 */
interface ItemPayloadBruto {
  readonly descricao?: string;
  readonly quantidade: number;
  readonly precoUnitario: { readonly valorCentavos: number; readonly moeda: string };
  readonly categoria?: string;
  readonly extraido: boolean;
}

interface OrcamentoValidadoPayloadBruto {
  readonly orcamentoId: string;
  readonly itens: readonly ItemPayloadBruto[];
  readonly condicoesComerciais: string;
}

function ehItemPayloadBruto(valor: unknown): valor is ItemPayloadBruto {
  if (typeof valor !== 'object' || valor === null) return false;
  const item = valor as Record<string, unknown>;
  const precoUnitario = item.precoUnitario as Record<string, unknown> | undefined;
  return (
    typeof item.quantidade === 'number' &&
    typeof precoUnitario === 'object' &&
    precoUnitario !== null &&
    typeof precoUnitario.valorCentavos === 'number' &&
    typeof precoUnitario.moeda === 'string' &&
    typeof item.extraido === 'boolean' &&
    (item.descricao === undefined || typeof item.descricao === 'string') &&
    (item.categoria === undefined || typeof item.categoria === 'string')
  );
}

/** Type guard estrutural — payload de evento de outro Bounded Context é entrada não confiável. */
function ehOrcamentoValidadoPayloadBruto(valor: unknown): valor is OrcamentoValidadoPayloadBruto {
  if (typeof valor !== 'object' || valor === null) return false;
  const payload = valor as Record<string, unknown>;
  return (
    typeof payload.orcamentoId === 'string' &&
    typeof payload.condicoesComerciais === 'string' &&
    Array.isArray(payload.itens) &&
    payload.itens.every(ehItemPayloadBruto)
  );
}

function origemValidacaoDe(detailType: OrcamentoValidadoEventDetailType): OrigemValidacao {
  return OrigemValidacao.de(
    detailType === 'OrcamentoValidadoComRessalva' ? 'VALIDADO_COM_RESSALVA' : 'VALIDADO',
  );
}

/**
 * Implementação da Anti-Corruption Layer (`orcamento-validado-event.acl.ts`,
 * Domain, T014) entre o Domain deste BC e o payload bruto dos eventos
 * `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (`source: nexo.validacao`,
 * payload enriquecido com `itens`/`condicoesComerciais`, ADR-003/T006 do
 * plan.md). Nunca importa tipos de domínio do BC Validação — apenas o shape
 * de wire (contrato JSON) replicado localmente; `payloadBruto: unknown` é
 * validado por type guard estrutural antes de qualquer leitura de campo.
 *
 * `resumoFornecedor` não existe no payload upstream (spec 003 não carrega
 * identificação de fornecedor no evento) — mapeado como string vazia;
 * `ConteudoIndexavel.de` ainda assim é válido enquanto `itensDescricao`/
 * `condicoesResumo`/`categorias` tiverem algum conteúdo (invariante "nunca
 * inteiramente vazio", ver `conteudo-indexavel.vo.ts`).
 */
export class OrcamentoValidadoEventACL implements OrcamentoValidadoEventACLPort {
  traduzir(
    detailType: OrcamentoValidadoEventDetailType,
    payloadBruto: unknown,
  ): OrcamentoValidadoEventACLResultado {
    if (!ehOrcamentoValidadoPayloadBruto(payloadBruto)) {
      throw new OrcamentoValidadoEventACLInvalidaError(
        'esperado objeto com orcamentoId (string), condicoesComerciais (string) e ' +
          'itens (array de { quantidade, precoUnitario: { valorCentavos, moeda }, extraido, ' +
          'descricao?, categoria? })',
      );
    }

    const categorias = [
      ...new Set(
        payloadBruto.itens
          .map((item) => item.categoria)
          .filter((categoria): categoria is string => categoria !== undefined),
      ),
    ];

    const conteudoIndexavel = ConteudoIndexavel.de({
      resumoFornecedor: '',
      itensDescricao: payloadBruto.itens.map((item) => item.descricao ?? ''),
      condicoesResumo: payloadBruto.condicoesComerciais,
      categorias,
    });

    return {
      orcamentoId: OrcamentoId.de(payloadBruto.orcamentoId),
      conteudoIndexavel,
      origemValidacao: origemValidacaoDe(detailType),
    };
  }
}
