import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ClassificadorLambdaRoleStack } from './classificador-lambda-role-stack.ts';

/**
 * Síntese CDK isolada (T062/#613) — mesmo racional de
 * `validar-orcamento-lambda-role-stack.test.ts`: prova de configuração, não
 * de comportamento real (LocalStack não aplica IAM). Garante o que a task
 * exige: `events:PutEvents` restrito ao ARN do bus + `Condition`
 * `events:source`, nunca `Resource: "*"` em nenhuma statement da role.
 */
describe('ClassificadorLambdaRoleStack — síntese CDK', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const fakeStack = new Stack(app, 'DependenciasFakeStack');
    const orcamentosRawBucket = new s3.Bucket(fakeStack, 'BucketFake');
    const classificadorQueue = new sqs.Queue(fakeStack, 'ClassificadorQueueFake');
    const dominioBus = new events.EventBus(fakeStack, 'DominioBusFake');

    const stack = new ClassificadorLambdaRoleStack(app, 'ClassificadorLambdaRoleStack', {
      orcamentosRawBucket,
      classificadorQueue,
      dominioBus,
    });

    template = Template.fromStack(stack);
  }, 30000);

  it('declara ModeloBedrockAprovadoArn e MarkItDownLambdaArn como CfnParameter obrigatórios', () => {
    template.hasParameter('ModeloBedrockAprovadoArn', { Type: 'String' });
    template.hasParameter('MarkItDownLambdaArn', { Type: 'String' });
  });

  it('restringe bedrock:InvokeModel ao Ref do CfnParameter, nunca a "*"', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'InvocarModeloBedrockAprovado',
            Effect: 'Allow',
            Action: 'bedrock:InvokeModel',
            Resource: { Ref: 'ModeloBedrockAprovadoArn' },
          }),
        ]),
      }),
    });
  });

  it('restringe events:PutEvents ao ARN do bus + Condition events:source', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'PublicarEventosDeClassificacaoNoBusDeDominio',
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
