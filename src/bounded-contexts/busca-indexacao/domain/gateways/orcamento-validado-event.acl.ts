import type { TenantId } from '../../../../shared-kernel/tenant/tenant-id.vo.js';
import type { ConteudoIndexavel } from '../value-objects/conteudo-indexavel.vo.js';
import type { OrcamentoId } from '../value-objects/orcamento-id.vo.js';
import type { OrigemValidacao } from '../value-objects/origem-validacao.vo.js';

export type OrcamentoValidadoEventDetailType = 'OrcamentoValidado' | 'OrcamentoValidadoComRessalva';

export interface OrcamentoValidadoEventACLResultado {
  readonly orcamentoId: OrcamentoId;
  readonly conteudoIndexavel: ConteudoIndexavel;
  readonly origemValidacao: OrigemValidacao;
  /**
   * Extraído do envelope v2 de 003 (spec-007 T041/T042, ADR-008). Sempre
   * presente e validado (`TenantId.de`) neste resultado — a porta declara o
   * tipo já obrigatório porque a checagem de "veio ou não" é decisão de
   * contrato/tradução (pertence ao adaptador de Infrastructure que valida o
   * payload bruto), nunca algo que o consumidor deste resultado precise
   * repetir.
   */
  readonly tenantId: TenantId;
}

/**
 * Anti-Corruption Layer obrigatória entre o Domain deste BC e o payload bruto
 * dos eventos `OrcamentoValidado`/`OrcamentoValidadoComRessalva`
 * (`source: nexo.validacao`) — traduz o shape do evento upstream (payload
 * enriquecido com `itens`/`condicoesComerciais`, ver ADR-003 do `plan.md` e
 * T006/T018) para `ConteudoIndexavel` + `OrigemValidacao` locais deste BC,
 * nunca importando tipos de domínio do BC Validação (fronteira de Bounded
 * Context, plan.md). `payloadBruto` é entrada não confiável (evento de outro
 * contexto, contendo conteúdo derivado de documento de fornecedor) —
 * `unknown` de propósito, nunca tipado com base numa suposição de shape.
 * `detailType` distingue a origem (`VALIDADO`/`VALIDADO_COM_RESSALVA`,
 * ADR-004) sem instituir hierarquia de "menos válido" entre as duas.
 * Implementado na Infrastructure (`OrcamentoValidadoEventACL`, T018).
 *
 * **Amendment spec-007 T042 (ADR-008)**: `tenantId` do envelope de 003 ainda
 * é opcional na origem (T041, expand/contract — cutover de contrato
 * verdadeiro fica para issue futura, ver #632). Esta ACL rejeita
 * explicitamente (`OrcamentoValidadoEventACLInvalidaError`) qualquer evento
 * sem `tenantId` — decisão vinculante registrada na PR de T042: zero tenant
 * real em produção hoje (#587/#297/T045), nenhuma Lambda implantada, e a ACL
 * é a fronteira de tradução entre BCs — o lugar certo para falhar rápido em
 * contrato incompleto em vez de indexar sem isolamento de tenant.
 */
export interface OrcamentoValidadoEventACL {
  traduzir(
    detailType: OrcamentoValidadoEventDetailType,
    payloadBruto: unknown,
  ): OrcamentoValidadoEventACLResultado;
}
