import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'decisao-workflow-queue';
const DLQ_NAME = 'decisao-workflow-queue-dlq';

/**
 * Fila consumida por `ConsolidarEDecidirWorkflow` (BC Orquestração, spec 005,
 * T003/#209) — gatilho real da decisão de workflow (último evento da cadeia
 * causal). Regra EventBridge roteando `OrcamentoValidado`/
 * `OrcamentoValidadoComRessalva` para esta fila é provisionada separadamente
 * (T006/#212). DLQ + alarme CloudWatch em mensagem na DLQ é o mecanismo
 * operacional que torna visível um contexto que nunca se consolida
 * (Princípio IV, plan.md §147, ADR-001).
 */
export class DecisaoWorkflowQueueStack extends Stack {
  public readonly decisaoWorkflowQueue: sqs.Queue;
  public readonly decisaoWorkflowQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.decisaoWorkflowQueueDlq = new sqs.Queue(this, 'DecisaoWorkflowQueueDlq', {
      queueName: DLQ_NAME,
      retentionPeriod: Duration.days(14),
    });

    this.decisaoWorkflowQueue = new sqs.Queue(this, 'DecisaoWorkflowQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: this.decisaoWorkflowQueueDlq,
        maxReceiveCount: 3,
      },
    });

    new cloudwatch.Alarm(this, 'DecisaoWorkflowQueueDlqAlarm', {
      alarmDescription:
        'Mensagem na DLQ de decisao-workflow-queue — contexto que nunca se consolida ou falha não recuperável na decisão de workflow (nunca silenciosa).',
      metric: this.decisaoWorkflowQueueDlq.metricApproximateNumberOfMessagesVisible({
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
