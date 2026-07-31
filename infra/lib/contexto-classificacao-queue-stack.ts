import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'contexto-classificacao-queue';
const DLQ_NAME = 'contexto-classificacao-queue-dlq';
/** `detailType` de `OrcamentoClassificado` (domain event, spec 001) — literal aqui de propósito: infra CDK
 * roda em Node com strip-only TS e não importa `src/` (parameter properties do Domain não são suportadas
 * nesse modo); manter em sincronia manual com `OrcamentoClassificado.detailType`. */
const DETAIL_TYPE_ORCAMENTO_CLASSIFICADO = 'OrcamentoClassificado';
/** `source` fixo do BC Ingestão & Identificação no bus único (`eventbridge.publisher.ts` daquele BC). */
const SOURCE_INGESTAO_IDENTIFICACAO = 'nexo.ingestao-identificacao';

export interface ContextoClassificacaoQueueStackProps extends StackProps {
  /** Bus de domínio já provisionado (`DominioEventBusStack`) — importado por referência, nunca recriado. */
  readonly dominioBus: events.IEventBus;
}

/**
 * Fila consumida por `RegistrarContextoClassificacao` (BC Orquestração,
 * spec 005, T003/#209). Regra EventBridge roteia `OrcamentoClassificado`
 * (source `nexo.ingestao-identificacao`) do bus único `nexo-dominio-bus`
 * para esta fila (T004/#210). DLQ + alarme CloudWatch em mensagem na DLQ —
 * exceção de infraestrutura nunca silenciosa (Princípio IV, plan.md §147).
 */
export class ContextoClassificacaoQueueStack extends Stack {
  public readonly contextoClassificacaoQueue: sqs.Queue;
  public readonly contextoClassificacaoQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: ContextoClassificacaoQueueStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.contextoClassificacaoQueueDlq = new sqs.Queue(this, 'ContextoClassificacaoQueueDlq', {
      queueName: DLQ_NAME,
      retentionPeriod: Duration.days(14),
    });

    this.contextoClassificacaoQueue = new sqs.Queue(this, 'ContextoClassificacaoQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: this.contextoClassificacaoQueueDlq,
        maxReceiveCount: 3,
      },
    });

    new events.Rule(this, 'OrcamentoClassificadoParaContextoClassificacaoQueue', {
      eventBus: props.dominioBus,
      description:
        'Roteia OrcamentoClassificado do bus de domínio para contexto-classificacao-queue (T004).',
      eventPattern: {
        source: [SOURCE_INGESTAO_IDENTIFICACAO],
        detailType: [DETAIL_TYPE_ORCAMENTO_CLASSIFICADO],
      },
      targets: [new targets.SqsQueue(this.contextoClassificacaoQueue)],
    });

    new cloudwatch.Alarm(this, 'ContextoClassificacaoQueueDlqAlarm', {
      alarmDescription:
        'Mensagem na DLQ de contexto-classificacao-queue — falha não recuperável ao registrar contexto de classificação (nunca silenciosa).',
      metric: this.contextoClassificacaoQueueDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
