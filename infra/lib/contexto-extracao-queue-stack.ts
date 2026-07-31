import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'contexto-extracao-queue';
const DLQ_NAME = 'contexto-extracao-queue-dlq';

/**
 * Fila consumida por `RegistrarContextoExtracao` (BC Orquestração, spec 005,
 * T003/#209). Regra EventBridge roteando `OrcamentoExtraido`/
 * `OrcamentoExtraidoComPendenciaConfirmada` para esta fila é provisionada
 * separadamente (T005/#211). DLQ + alarme CloudWatch em mensagem na DLQ —
 * exceção de infraestrutura nunca silenciosa (Princípio IV, plan.md §147).
 */
export class ContextoExtracaoQueueStack extends Stack {
  public readonly contextoExtracaoQueue: sqs.Queue;
  public readonly contextoExtracaoQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.contextoExtracaoQueueDlq = new sqs.Queue(this, 'ContextoExtracaoQueueDlq', {
      queueName: DLQ_NAME,
      retentionPeriod: Duration.days(14),
    });

    this.contextoExtracaoQueue = new sqs.Queue(this, 'ContextoExtracaoQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: this.contextoExtracaoQueueDlq,
        maxReceiveCount: 3,
      },
    });

    new cloudwatch.Alarm(this, 'ContextoExtracaoQueueDlqAlarm', {
      alarmDescription:
        'Mensagem na DLQ de contexto-extracao-queue — falha não recuperável ao registrar contexto de extração (nunca silenciosa).',
      metric: this.contextoExtracaoQueueDlq.metricApproximateNumberOfMessagesVisible({
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
