import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, it } from 'vitest';
import { ContextoClassificacaoQueueStack } from './contexto-classificacao-queue-stack.ts';
import { DominioEventBusStack } from './dominio-event-bus-stack.ts';

/**
 * (issue #744) Prova de que a regra EventBridge de `contexto-classificacao-queue`
 * casa também `OrcamentoReclassificadoPorRevisaoHumana` — sem isso, o BC
 * Orquestração (005) nunca registra o contexto de classificação corrigido
 * manualmente.
 */
describe('ContextoClassificacaoQueueStack — síntese CDK', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const busStack = new DominioEventBusStack(app, 'DominioBusFakeStack');
    const stack = new ContextoClassificacaoQueueStack(app, 'ContextoClassificacaoQueueStack', {
      dominioBus: busStack.dominioBus,
    });
    template = Template.fromStack(stack);
  }, 30000);

  it('roteia OrcamentoClassificado e OrcamentoReclassificadoPorRevisaoHumana para contexto-classificacao-queue', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: Match.objectLike({
        source: ['nexo.ingestao-identificacao'],
        'detail-type': Match.arrayEquals([
          'OrcamentoClassificado',
          'OrcamentoReclassificadoPorRevisaoHumana',
        ]),
      }),
    });
  });
});
