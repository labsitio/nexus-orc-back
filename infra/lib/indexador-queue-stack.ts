import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'indexador-queue';
const DLQ_NAME = 'indexador-queue-dlq';
/** `detailType` dos eventos do BC Validação que disparam indexação (spec 003) — literais aqui de
 * propósito: infra CDK roda em Node com strip-only TS e não importa `src/` (parameter properties
 * do Domain não são suportadas nesse modo); manter em sincronia manual com os `detailType` reais. */
const DETAIL_TYPE_ORCAMENTO_VALIDADO = 'OrcamentoValidado';
const DETAIL_TYPE_ORCAMENTO_VALIDADO_COM_RESSALVA = 'OrcamentoValidadoComRessalva';
/** `source` fixo do BC Validação no bus único (mesma convenção `nexo.<bc>` das demais specs). */
const SOURCE_VALIDACAO = 'nexo.validacao';

export interface IndexadorQueueStackProps extends StackProps {
  /** Bus de domínio já provisionado (`DominioEventBusStack`) — importado por referência, nunca recriado. */
  readonly dominioBus: events.IEventBus;
}

/**
 * Fila consumida por `IndexarOrcamento` (BC Busca & Indexação, spec 004,
 * T004/#164) — único consumidor assíncrono desta spec. Regra EventBridge
 * roteia `OrcamentoValidado`/`OrcamentoValidadoComRessalva` (source
 * `nexo.validacao`) do bus único `nexo-dominio-bus` para esta fila
 * (T005/#165). Sem fila de revisão humana de negócio (ADR-002 do plan.md —
 * falha de indexação é exceção técnica, não julgamento de negócio); DLQ +
 * alarme CloudWatch em mensagem na DLQ é o mecanismo operacional que torna
 * a falha nunca silenciosa (Princípio IV).
 */
export class IndexadorQueueStack extends Stack {
  public readonly indexadorQueue: sqs.Queue;
  public readonly indexadorQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: IndexadorQueueStackProps) {
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

    new events.Rule(this, 'OrcamentoValidadoParaIndexadorQueue', {
      eventBus: props.dominioBus,
      description:
        'Roteia OrcamentoValidado/OrcamentoValidadoComRessalva do bus de domínio para indexador-queue (T005).',
      eventPattern: {
        source: [SOURCE_VALIDACAO],
        detailType: [DETAIL_TYPE_ORCAMENTO_VALIDADO, DETAIL_TYPE_ORCAMENTO_VALIDADO_COM_RESSALVA],
      },
      targets: [new targets.SqsQueue(this.indexadorQueue)],
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
