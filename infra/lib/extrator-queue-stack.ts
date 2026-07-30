import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'extrator-queue';
const DLQ_NAME = 'extrator-queue-dlq';

/**
 * Fila consumida por `ExtrairDadosOrcamento` (BC Extração, T003/#68). Regra
 * EventBridge roteando `OrcamentoClassificado` para esta fila é provisionada
 * separadamente (T004/#69). DLQ + alarme CloudWatch em mensagem na DLQ —
 * exceção de infraestrutura nunca silenciosa (Princípio IV, plan.md §134).
 */
export class ExtratorQueueStack extends Stack {
  public readonly extratorQueue: sqs.Queue;
  public readonly extratorQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.extratorQueueDlq = new sqs.Queue(this, 'ExtratorQueueDlq', {
      queueName: DLQ_NAME,
      retentionPeriod: Duration.days(14),
    });

    this.extratorQueue = new sqs.Queue(this, 'ExtratorQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: this.extratorQueueDlq,
        maxReceiveCount: 3,
      },
    });

    new cloudwatch.Alarm(this, 'ExtratorQueueDlqAlarm', {
      alarmDescription:
        'Mensagem na DLQ de extrator-queue — falha não recuperável de extração (nunca silenciosa).',
      metric: this.extratorQueueDlq.metricApproximateNumberOfMessagesVisible({
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
