import { Stack, type StackProps } from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import type { Construct } from 'constructs';

export interface RotaHttpProps {
  /** Nome estável do construct da rota — vira parte do id do recurso CDK (ex.: `ReceberOrcamentoUploadUrl`). */
  readonly id: string;
  readonly method: apigatewayv2.HttpMethod;
  readonly path: string;
  /** `NodejsFunction` já ligada à role dedicada da rota (uma role por rota, ver ADR-017). */
  readonly funcao: lambda.IFunction;
}

/**
 * API Gateway HTTP API único (ADR-017, Decisão 1) — payload v2, Lambda proxy
 * integration, 1 Lambda por rota. **Sem authorizer** (ADR-017, Decisão 3):
 * autenticação/autorização ficam 100% dentro da Lambda via
 * `TenantContextMiddleware`/`criarExigenciaPapel`; um authorizer aqui seria
 * uma 3ª verificação de JWT empilhada sobre o trade-off já aceito no ADR-007.
 *
 * `adicionarRota` é o mecanismo de registro que as 12 tasks derivadas do
 * ADR-017 (T069/001, T047/002, T051/003, T047/004, T058/005) vão consumir a
 * partir de `infra/bin/app.ts`, depois de criar a `NodejsFunction` de cada
 * rota — assim nenhum autor futuro decide convenção própria de path/integração.
 */
export class HttpApiStack extends Stack {
  public readonly httpApi: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: 'NexoHttpApi',
      createDefaultStage: true,
    });
  }

  /** Liga uma `NodejsFunction` de rota (role dedicada já criada por task própria) a um path/método deste HTTP API. */
  public adicionarRota(props: RotaHttpProps): void {
    this.httpApi.addRoutes({
      path: props.path,
      methods: [props.method],
      integration: new HttpLambdaIntegration(`${props.id}Integration`, props.funcao),
    });
  }
}
