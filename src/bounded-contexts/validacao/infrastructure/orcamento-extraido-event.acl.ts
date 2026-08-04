import { TenantId } from '../../../shared-kernel/tenant/tenant-id.vo.js';
import { ErroDominio } from '../domain/errors/erro-dominio.js';
import { DadosExtraidosParaValidacao } from '../domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { Dinheiro } from '../domain/value-objects/dinheiro.vo.js';
import { ItemParaValidacao } from '../domain/value-objects/item-para-validacao.vo.js';
import { OrcamentoId } from '../domain/value-objects/orcamento-id.vo.js';
import { PeriodoValidade } from '../domain/value-objects/periodo-validade.vo.js';
import type {
  OrcamentoExtraidoEventACL,
  OrcamentoExtraidoEventACLResultado,
} from '../domain/gateways/orcamento-extraido-event.acl.js';

export class OrcamentoExtraidoEventACLPayloadIncompletoError extends ErroDominio {
  constructor(campo: string) {
    super(
      `Payload de OrcamentoExtraido incompleto para validação: campo "${campo}" ausente ou não extraído`,
    );
  }
}

/**
 * Shape estrutural do payload bruto de `OrcamentoExtraido`/
 * `OrcamentoExtraidoComPendenciaConfirmada` (`source: nexo.extracao`,
 * `schemaVersion: 1`) — espelha `CampoExtraidoPayload<T>`/`ItemOrcamentoPayload`/
 * `CondicoesComerciaisPayload` do BC Extração **sem importar** nenhum tipo de
 * lá (fronteira de Bounded Context, plan.md); tipado aqui só como shape de
 * leitura estrutural do JSON recebido via EventBridge/SQS, nunca como
 * dependência de compilação cruzada.
 *
 * `cnpjFornecedor` e `dataEmissaoProposta` são lidos aqui, mas **hoje não
 * existem no contrato real publicado por `OrcamentoExtraido`** (spec-002) —
 * ver nota de bloqueio no rodapé deste arquivo. Mantidos como campos
 * opcionais para não quebrar a tradução no dia em que o contrato for
 * estendido (coordenação com o dono da spec-002, mesmo tema já registrado em
 * `tasks.md` T050/#160 para `dataEmissaoProposta`).
 */
interface CampoExtraidoPayloadBruto<T> {
  readonly valor: T | null;
  readonly extraido: boolean;
}

interface ItemPayloadBruto {
  readonly descricao: CampoExtraidoPayloadBruto<{ descricao: string; sku?: string }>;
  readonly quantidade: CampoExtraidoPayloadBruto<number>;
  readonly precoUnitario: CampoExtraidoPayloadBruto<{ valorCentavos: number; moeda: string }>;
}

interface CondicoesComerciaisPayloadBruto {
  readonly condicoesPagamento: CampoExtraidoPayloadBruto<string>;
  readonly prazoValidade: CampoExtraidoPayloadBruto<string>;
  readonly condicoesEntrega: CampoExtraidoPayloadBruto<string>;
}

interface OrcamentoExtraidoPayloadBruto {
  readonly orcamentoId: string;
  readonly itens: readonly ItemPayloadBruto[];
  readonly condicoesComerciais: CondicoesComerciaisPayloadBruto;
  readonly cnpjFornecedor?: string;
  readonly dataEmissaoProposta?: string;
  /**
   * (issue #649 — expand/contract, ADR-008) Ainda opcional no envelope de
   * origem (spec-002 #648). `undefined` nunca é rejeitado aqui — ver
   * `OrcamentoExtraidoEventACLResultado.tenantId`.
   */
  readonly tenantId?: string;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/** Valida a forma mínima esperada antes de tratar `payloadBruto` como `OrcamentoExtraidoPayloadBruto`. */
function comoPayloadBruto(payloadBruto: unknown): OrcamentoExtraidoPayloadBruto {
  if (
    !ehObjeto(payloadBruto) ||
    typeof payloadBruto.orcamentoId !== 'string' ||
    !Array.isArray(payloadBruto.itens) ||
    !ehObjeto(payloadBruto.condicoesComerciais)
  ) {
    throw new OrcamentoExtraidoEventACLPayloadIncompletoError(
      'orcamentoId/itens/condicoesComerciais',
    );
  }
  return payloadBruto as unknown as OrcamentoExtraidoPayloadBruto;
}

function itemDoPayloadBruto(payload: ItemPayloadBruto): ItemParaValidacao {
  if (!payload.quantidade.extraido || payload.quantidade.valor === null) {
    throw new OrcamentoExtraidoEventACLPayloadIncompletoError('itens[].quantidade');
  }
  if (!payload.precoUnitario.extraido || payload.precoUnitario.valor === null) {
    throw new OrcamentoExtraidoEventACLPayloadIncompletoError('itens[].precoUnitario');
  }
  const descricaoExtraida = payload.descricao.extraido ? payload.descricao.valor : null;

  return ItemParaValidacao.de({
    quantidade: payload.quantidade.valor,
    precoUnitario: Dinheiro.de(
      payload.precoUnitario.valor.valorCentavos,
      payload.precoUnitario.valor.moeda,
    ),
    // Preserva `extraido: false` mesmo quando `descricaoExtraida` é `null` —
    // é exatamente essa combinação que permite a regra "campos obrigatórios
    // preenchidos" (T010) ainda reprovar item com pendência confirmada pela
    // Extração (plan.md, decisão de negócio do agregado `OrcamentoValidacao`).
    extraido: payload.descricao.extraido,
    ...(descricaoExtraida !== null ? { descricao: descricaoExtraida.descricao } : {}),
  });
}

function condicoesComerciaisTexto(condicoes: CondicoesComerciaisPayloadBruto): string {
  const partes = [condicoes.condicoesPagamento, condicoes.condicoesEntrega]
    .filter((campo) => campo.extraido && campo.valor)
    .map((campo) => campo.valor as string);
  return partes.join(' | ');
}

function periodoValidadeDoPayload(condicoes: CondicoesComerciaisPayloadBruto): PeriodoValidade {
  if (!condicoes.prazoValidade.extraido || condicoes.prazoValidade.valor === null) {
    throw new OrcamentoExtraidoEventACLPayloadIncompletoError('condicoesComerciais.prazoValidade');
  }
  return PeriodoValidade.de(new Date(condicoes.prazoValidade.valor));
}

/**
 * Implementa `OrcamentoExtraidoEventACL` (Domain, T012) — traduz o payload
 * bruto (`unknown`, entrada não confiável de outro Bounded Context) dos
 * eventos `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada` para
 * `DadosExtraidosParaValidacao`, nunca importando tipos de domínio do BC
 * Extração (fronteira de Bounded Context, plan.md).
 *
 * **Bloqueio de contrato registrado (reportar ao arquiteto-back/dono da
 * spec-002)**: o payload real publicado hoje por `OrcamentoExtraido`
 * (`src/bounded-contexts/extracao/domain/events/orcamento-extraido.event.ts`)
 * não inclui `cnpjFornecedor` nem `dataEmissaoProposta` — campos exigidos por
 * `DadosExtraidosParaValidacao` para 3 das 4 regras determinísticas desta
 * spec: `validarCnpjValido` (precisa de `cnpjFornecedor`) e
 * `validarPrazoCoerente` (precisa de `dataEmissaoProposta` comparado a
 * `periodoValidade`). Enquanto o contrato não for estendido, esta tradução
 * lança `OrcamentoExtraidoEventACLPayloadIncompletoError` para qualquer
 * payload real (que nunca traz esses dois campos) — falha alta e explícita
 * na fronteira do ACL, nunca um valor inventado silenciosamente. `#160`/T050
 * já rastreia a coordenação para `dataEmissaoProposta`; `cnpjFornecedor`
 * precisa do mesmo tratamento (nenhum campo equivalente existe em nenhum
 * evento hoje publicado pela Extração).
 */
export class OrcamentoExtraidoEventACLImpl implements OrcamentoExtraidoEventACL {
  traduzir(payloadBruto: unknown): OrcamentoExtraidoEventACLResultado {
    const payload = comoPayloadBruto(payloadBruto);

    if (!payload.cnpjFornecedor) {
      throw new OrcamentoExtraidoEventACLPayloadIncompletoError('cnpjFornecedor');
    }
    if (!payload.dataEmissaoProposta) {
      throw new OrcamentoExtraidoEventACLPayloadIncompletoError('dataEmissaoProposta');
    }

    const dadosExtraidos = DadosExtraidosParaValidacao.de({
      cnpjFornecedor: payload.cnpjFornecedor,
      itens: payload.itens.map(itemDoPayloadBruto),
      condicoesComerciais: condicoesComerciaisTexto(payload.condicoesComerciais),
      dataEmissaoProposta: new Date(payload.dataEmissaoProposta),
      periodoValidade: periodoValidadeDoPayload(payload.condicoesComerciais),
    });

    return {
      orcamentoId: OrcamentoId.de(payload.orcamentoId),
      dadosExtraidos,
      // (issue #649) Nunca rejeitado quando ausente — ver
      // `OrcamentoExtraidoEventACLResultado.tenantId`.
      tenantId: payload.tenantId !== undefined ? TenantId.de(payload.tenantId) : undefined,
    };
  }
}
