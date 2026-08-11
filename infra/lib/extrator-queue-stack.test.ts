import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, it } from 'vitest';
import { DominioEventBusStack } from './dominio-event-bus-stack.ts';
import { ExtratorQueueStack } from './extrator-queue-stack.ts';

/**
 * (issue #744) Prova de que a regra EventBridge de `extrator-queue` casa
 * também `OrcamentoReclassificadoPorRevisaoHumana` — sem isso, a confirmação
 * de revisão humana via API nunca retoma o pipeline (002 nunca recebe nada).
 */
describe('ExtratorQueueStack — síntese CDK', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const busStack = new DominioEventBusStack(app, 'DominioBusFakeStack');
    const stack = new ExtratorQueueStack(app, 'ExtratorQueueStack', {
      dominioBus: busStack.dominioBus,
    });
    template = Template.fromStack(stack);
  }, 30000);

  it('roteia OrcamentoClassificado e OrcamentoReclassificadoPorRevisaoHumana para extrator-queue', () => {
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
