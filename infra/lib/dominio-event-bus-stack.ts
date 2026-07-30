import { Stack, type StackProps } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import type { Construct } from 'constructs';

const BUS_NAME = 'nexo-dominio-bus';

/**
 * Bus de domínio único, compartilhado por TODOS os Bounded Contexts do
 * produto (plan.md §"Bus de eventos", T013). Roteamento é por regra/
 * `detail-type` dentro deste mesmo bus, nunca por bus separado por contexto —
 * mantém um único ponto de auditoria de todos os eventos de domínio
 * (Princípio I — rastreabilidade ponta a ponta).
 *
 * Escopo desta issue (T013): só o bus. As regras de roteamento para filas
 * SQS específicas (ex.: `OrcamentoRecebido` → `classificador-queue`) nascem
 * junto com cada fila, em cada issue/spec consumidora (ex.: T033) — criar
 * regra apontando para uma fila que ainda não existe seria especulativo.
 */
export class DominioEventBusStack extends Stack {
  public readonly dominioBus: events.EventBus;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.dominioBus = new events.EventBus(this, 'DominioBus', {
      eventBusName: BUS_NAME,
    });
  }
}
