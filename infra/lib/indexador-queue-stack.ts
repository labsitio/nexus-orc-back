import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'indexador-queue';
const DLQ_NAME = 'indexador-queue-dlq';

/**
 * Fila consumida por `IndexarOrcamento` (BC Busca & Indexação, spec 004,
 * T004/#164) — único consumidor assíncrono desta spec. Regra EventBridge
 * roteando `OrcamentoValidado`/`OrcamentoValidadoComRessalva` para esta fila
 * é provisionada separadamente (T005/#165). Sem fila de revisão humana de
 * negócio (ADR-002 do plan.md — falha de indexação é exceção técnica, não
 * julgamento de negócio); DLQ + alarme CloudWatch em mensagem na DLQ é o
 * mecanismo operacional que torna a falha nunca silenciosa (Princípio IV).
 */
export class IndexadorQueueStack extends Stack {
  public readonly indexadorQueue: sqs.Queue;
  public readonly indexadorQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.indexadorQueueDlq = new sqs.Queue(this, 'IndexadorQueueDlq', {
      queueName: DLQ_NAME,
      retentionPeriod: Duration.days(14),
    });

    this.indexadorQueue = new sqs.Queue(this, 'IndexadorQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: this.indexadorQueueDlq,
        maxReceiveCount: 3,
      },
    });

    new cloudwatch.Alarm(this, 'IndexadorQueueDlqAlarm', {
      alarmDescription:
        'Mensagem na DLQ de indexador-queue — falha técnica não recuperável de indexação (nunca silenciosa).',
      metric: this.indexadorQueueDlq.metricApproximateNumberOfMessagesVisible({
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
