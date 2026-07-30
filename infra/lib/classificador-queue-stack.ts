import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'classificador-queue';
const DLQ_NAME = 'classificador-queue-dlq';
/** `detailType` de `OrcamentoRecebido` (domain event, T008/#13) — literal aqui de propósito: infra CDK
 * roda em Node com strip-only TS e não importa `src/` (parameter properties do Domain não são suportadas
 * nesse modo); manter em sincronia manual com `OrcamentoRecebido.detailType`. */
const DETAIL_TYPE_ORCAMENTO_RECEBIDO = 'OrcamentoRecebido';

export interface ClassificadorQueueStackProps extends StackProps {
  /** Bus de domínio já provisionado (T013/`DominioEventBusStack`) — importado por nome, nunca recriado. */
  readonly dominioBus: events.IEventBus;
}

/**
 * Fila consumida por `ClassificarOrcamento` (T032/#37) via handler Lambda
 * (T034/#39). Regra EventBridge roteia `OrcamentoRecebido` do bus único
 * `nexo-dominio-bus` para esta fila (plan.md §Infrastructure). DLQ +
 * alarme CloudWatch em mensagem na DLQ — exceção de infraestrutura nunca
 * silenciosa (Princípio IV).
 */
export class ClassificadorQueueStack extends Stack {
  public readonly classificadorQueue: sqs.Queue;
  public readonly classificadorQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: ClassificadorQueueStackProps) {
    super(scope, id, props);
    this.terminationProtection = true;

    this.classificadorQueueDlq = new sqs.Queue(this, 'ClassificadorQueueDlq', {
      queueName: DLQ_NAME,
      retentionPeriod: Duration.days(14),
    });

    this.classificadorQueue = new sqs.Queue(this, 'ClassificadorQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: this.classificadorQueueDlq,
        maxReceiveCount: 3,
      },
    });

    new events.Rule(this, 'OrcamentoRecebidoParaClassificadorQueue', {
      eventBus: props.dominioBus,
      description: 'Roteia OrcamentoRecebido do bus de domínio para classificador-queue (T033).',
      eventPattern: {
        detailType: [DETAIL_TYPE_ORCAMENTO_RECEBIDO],
      },
      targets: [new targets.SqsQueue(this.classificadorQueue)],
    });

    new cloudwatch.Alarm(this, 'ClassificadorQueueDlqAlarm', {
      alarmDescription:
        'Mensagem na DLQ de classificador-queue — falha não recuperável de classificação (nunca silenciosa).',
      metric: this.classificadorQueueDlq.metricApproximateNumberOfMessagesVisible({
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
