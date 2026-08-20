import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { beforeAll, describe, it } from 'vitest';
import { HttpApiStack } from './http-api-stack.ts';

/**
 * Síntese CDK isolada (issue #757) — prova de configuração, não de
 * comportamento real (sem credencial AWS). Garante o que a issue exige:
 * HTTP API único sem authorizer (ADR-017, Decisão 3) e que `adicionarRota`
 * liga uma rota a uma função existente sem criar role nova.
 */
describe('HttpApiStack — síntese CDK', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const httpApiStack = new HttpApiStack(app, 'HttpApiStack');

    const funcaoStack = new Stack(app, 'FuncaoFakeStack');
    const roleFake = new iam.Role(funcaoStack, 'RoleFake', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    const funcaoFake = new lambda.Function(funcaoStack, 'FuncaoFake', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      role: roleFake,
    });

    httpApiStack.adicionarRota({
      id: 'RotaFake',
      method: HttpMethod.POST,
      path: '/v1/rota-fake',
      funcao: funcaoFake,
    });

    template = Template.fromStack(httpApiStack);
  }, 30000);

  it('cria exatamente um HTTP API (protocolo v2)', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
    });
  });

  it('nunca cria authorizer (ADR-017, Decisão 3 — auth 100% dentro da Lambda)', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 0);
  });

  it('adicionarRota registra o path/método na rota, sem AuthorizerId', () => {
    template.hasResourceProperties(
      'AWS::ApiGatewayV2::Route',
      Match.objectLike({
        RouteKey: 'POST /v1/rota-fake',
        AuthorizationType: 'NONE',
        AuthorizerId: Match.absent(),
      }),
    );
  });
});
