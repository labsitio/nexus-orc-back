import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'validador-queue';
const DLQ_NAME = 'validador-queue-dlq';

/**
 * Fila consumida por `ValidarOrcamento` (BC Validação, spec 003, T003/#113).
 * Único consumidor assíncrono desta spec — sem fila de revisor de IA, por
 * decisão de ADR-001 (plan.md §135/§205: escalonamento humano direto,
 * mecanismo de resolução de inconsistência determinístico). Regra
 * EventBridge roteando `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * para esta fila é provisionada separadamente (T004). DLQ + alarme CloudWatch
 * em mensagem na DLQ — exceção de infraestrutura nunca silenciosa (Princípio IV).
 */
export class ValidadorQueueStack extends Stack {
  public readonly validadorQueue: sqs.Queue;
  public readonly validadorQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.validadorQueueDlq = new sqs.Queue(this, 'ValidadorQueueDlq', {
      queueName: DLQ_NAME,
      retentionPeriod: Duration.days(14),
    });

    this.validadorQueue = new sqs.Queue(this, 'ValidadorQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: this.validadorQueueDlq,
        maxReceiveCount: 3,
      },
    });

    new cloudwatch.Alarm(this, 'ValidadorQueueDlqAlarm', {
      alarmDescription:
        'Mensagem na DLQ de validador-queue — falha não recuperável de validação (nunca silenciosa).',
      metric: this.validadorQueueDlq.metricApproximateNumberOfMessagesVisible({
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
