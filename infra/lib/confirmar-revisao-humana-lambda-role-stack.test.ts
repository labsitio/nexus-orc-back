import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as events from 'aws-cdk-lib/aws-events';
import { beforeAll, describe, expect, it } from 'vitest';
import { ConfirmarRevisaoHumanaLambdaRoleStack } from './confirmar-revisao-humana-lambda-role-stack.ts';

/**
 * Síntese CDK isolada (T064/#579) — mesmo racional de
 * `receber-orcamento-lambda-role-stack.test.ts`: prova de configuração, não
 * de comportamento real (LocalStack não aplica IAM). Garante o que a task
 * exige: `events:PutEvents` restrito ao ARN do bus + `Condition` dupla
 * (`events:source` e `events:detail-type`), nunca `Resource: "*"`.
 */
describe('ConfirmarRevisaoHumanaLambdaRoleStack — síntese CDK', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const busStack = new Stack(app, 'BusFakeStack');
    const dominioBus = new events.EventBus(busStack, 'DominioBusFake');

    const stack = new ConfirmarRevisaoHumanaLambdaRoleStack(
      app,
      'ConfirmarRevisaoHumanaLambdaRoleStack',
      { dominioBus },
    );

    template = Template.fromStack(stack);
  }, 30000);

  it('restringe events:PutEvents ao ARN do bus + Condition events:source e events:detail-type', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'PublicarOrcamentoReclassificadoPorRevisaoHumanaNoBusDeDominio',
            Effect: 'Allow',
            Action: 'events:PutEvents',
            Condition: {
              StringEquals: {
                'events:source': 'nexo.ingestao-identificacao',
                'events:detail-type': 'OrcamentoReclassificadoPorRevisaoHumana',
              },
            },
          }),
        ]),
      }),
    });
  });

  it('nunca expõe wildcard "*" como Resource em nenhuma statement da role', () => {
    const policies = template.findResources('AWS::IAM::Policy');

    for (const policy of Object.values(policies)) {
      const statements = policy.Properties.PolicyDocument.Statement as Array<{
        Resource?: unknown;
      }>;
      for (const statement of statements) {
        expect(statement.Resource).not.toBe('*');
      }
    }
  });
});
