import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'contexto-classificacao-queue';
const DLQ_NAME = 'contexto-classificacao-queue-dlq';

/**
 * Fila consumida por `RegistrarContextoClassificacao` (BC Orquestração,
 * spec 005, T003/#209). Regra EventBridge roteando `OrcamentoClassificado`
 * para esta fila é provisionada separadamente (T004/#210). DLQ + alarme
 * CloudWatch em mensagem na DLQ — exceção de infraestrutura nunca silenciosa
 * (Princípio IV, plan.md §147).
 */
export class ContextoClassificacaoQueueStack extends Stack {
  public readonly contextoClassificacaoQueue: sqs.Queue;
  public readonly contextoClassificacaoQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
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
