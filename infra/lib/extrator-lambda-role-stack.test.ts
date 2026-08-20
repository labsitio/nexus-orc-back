import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ExtratorLambdaRoleStack } from './extrator-lambda-role-stack.ts';

/**
 * Síntese CDK isolada (issue #614, QA — PR #763) — mesmo racional de
 * `classificador-lambda-role-stack.test.ts`: prova de configuração, não de
 * comportamento real (LocalStack não aplica IAM). Fecha o nit do
 * backend-reviewer na PR #763: faltava teste de infra dedicado para a
 * policy `events:PutEvents` adicionada em `ExtratorLambdaRoleStack` (mesmo
 * achado BLOCKER já coberto por teste em `ClassificadorLambdaRoleStack`,
 * issue #613).
 */
describe('ExtratorLambdaRoleStack — síntese CDK', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const fakeStack = new Stack(app, 'DependenciasFakeStack');
    const orcamentosRawBucket = new s3.Bucket(fakeStack, 'BucketFake');
    const extratorQueue = new sqs.Queue(fakeStack, 'ExtratorQueueFake');
    const dominioBus = new events.EventBus(fakeStack, 'DominioBusFake');

    const stack = new ExtratorLambdaRoleStack(app, 'ExtratorLambdaRoleStack', {
      orcamentosRawBucket,
      extratorQueue,
      dominioBus,
    });

    template = Template.fromStack(stack);
  }, 30000);

  it('declara ModeloBedrockAprovadoArn e MarkItDownExtracaoLambdaArn como CfnParameter obrigatórios', () => {
    template.hasParameter('ModeloBedrockAprovadoArn', { Type: 'String' });
    template.hasParameter('MarkItDownExtracaoLambdaArn', { Type: 'String' });
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

  it('restringe lambda:InvokeFunction ao Ref do CfnParameter do MarkItDown, nunca a "*"', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'InvocarMarkItDownExtracaoLambda',
            Effect: 'Allow',
            Action: 'lambda:InvokeFunction',
            Resource: { Ref: 'MarkItDownExtracaoLambdaArn' },
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
            Sid: 'PublicarEventosDeExtracaoNoBusDeDominio',
            Effect: 'Allow',
            Action: 'events:PutEvents',
            Condition: {
              StringEquals: { 'events:source': 'nexo.extracao' },
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
