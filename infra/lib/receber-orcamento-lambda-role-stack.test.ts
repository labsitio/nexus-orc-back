import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as events from 'aws-cdk-lib/aws-events';
import { beforeAll, describe, expect, it } from 'vitest';
import { ReceberOrcamentoLambdaRoleStack } from './receber-orcamento-lambda-role-stack.ts';

/**
 * Síntese CDK isolada (T061/#613) — mesmo racional de
 * `validar-orcamento-lambda-role-stack.test.ts`: prova de configuração, não
 * de comportamento real (LocalStack não aplica IAM). Garante o que a task
 * exige: `events:PutEvents` restrito ao ARN do bus + `Condition`
 * `events:source`, nunca `Resource: "*"`.
 */
describe('ReceberOrcamentoLambdaRoleStack — síntese CDK', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const busStack = new Stack(app, 'BusFakeStack');
    const dominioBus = new events.EventBus(busStack, 'DominioBusFake');

    const stack = new ReceberOrcamentoLambdaRoleStack(app, 'ReceberOrcamentoLambdaRoleStack', {
      dominioBus,
    });

    template = Template.fromStack(stack);
  }, 30000);

  it('restringe events:PutEvents ao ARN do bus + Condition events:source', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'PublicarOrcamentoRecebidoNoBusDeDominio',
            Effect: 'Allow',
            Action: 'events:PutEvents',
            Condition: {
              StringEquals: { 'events:source': 'nexo.ingestao-identificacao' },
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
