import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ValidarOrcamentoLambdaRoleStack } from './validar-orcamento-lambda-role-stack.ts';

/**
 * Síntese CDK isolada (T045/#155) — prova de configuração, não de
 * comportamento real: LocalStack não aplica IAM, então nenhum teste local ou
 * de CI prova que a policy é de fato respeitada pelo serviço Bedrock em
 * produção. O que este teste garante é o único ponto exigido pela task: o
 * `Resource` do `bedrock:InvokeModel` nunca é `"*"`, é o `Ref` do
 * `CfnParameter` `ModeloCategorizacaoAprovadoArn`.
 *
 * Síntese roda uma única vez em `beforeAll` — synth via CDK é caro
 * (segundos) e o resultado é imutável entre as asserções.
 */
describe('ValidarOrcamentoLambdaRoleStack — síntese CDK', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const filaStack = new Stack(app, 'FilaFakeStack');
    const validadorQueue = new sqs.Queue(filaStack, 'ValidadorQueueFake');

    const stack = new ValidarOrcamentoLambdaRoleStack(app, 'ValidarOrcamentoLambdaRoleStack', {
      validadorQueue,
    });

    template = Template.fromStack(stack);
  }, 30000);

  it('declara ModeloCategorizacaoAprovadoArn como CfnParameter obrigatório', () => {
    template.hasParameter('ModeloCategorizacaoAprovadoArn', {
      Type: 'String',
    });
  });

  it('restringe bedrock:InvokeModel ao Ref do CfnParameter, nunca a "*"', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'InvocarModeloCategorizacaoAprovado',
            Effect: 'Allow',
            Action: 'bedrock:InvokeModel',
            Resource: { Ref: 'ModeloCategorizacaoAprovadoArn' },
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
