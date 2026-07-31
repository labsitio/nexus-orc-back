import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'contexto-extracao-queue';
const DLQ_NAME = 'contexto-extracao-queue-dlq';
/** `detailType` dos eventos do BC Extração que alimentam o contexto de extração (spec 002) — literais
 * aqui de propósito: infra CDK roda em Node com strip-only TS e não importa `src/` (parameter properties
 * do Domain não são suportadas nesse modo); manter em sincronia manual com os `detailType` reais. */
const DETAIL_TYPE_ORCAMENTO_EXTRAIDO = 'OrcamentoExtraido';
const DETAIL_TYPE_ORCAMENTO_EXTRAIDO_COM_PENDENCIA_CONFIRMADA =
  'OrcamentoExtraidoComPendenciaConfirmada';
/** `source` fixo do BC Extração no bus único (`eventbridge.publisher.ts` daquele BC). */
const SOURCE_EXTRACAO = 'nexo.extracao';

export interface ContextoExtracaoQueueStackProps extends StackProps {
  /** Bus de domínio já provisionado (`DominioEventBusStack`) — importado por referência, nunca recriado. */
  readonly dominioBus: events.IEventBus;
}

/**
 * Fila consumida por `RegistrarContextoExtracao` (BC Orquestração, spec 005,
 * T003/#209). Regra EventBridge roteia `OrcamentoExtraido`/
 * `OrcamentoExtraidoComPendenciaConfirmada` (source `nexo.extracao`) do bus
 * único `nexo-dominio-bus` para esta fila (T005/#211). DLQ + alarme
 * CloudWatch em mensagem na DLQ — exceção de infraestrutura nunca silenciosa
 * (Princípio IV, plan.md §147).
 */
export class ContextoExtracaoQueueStack extends Stack {
  public readonly contextoExtracaoQueue: sqs.Queue;
  public readonly contextoExtracaoQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: ContextoExtracaoQueueStackProps) {
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

    new events.Rule(this, 'OrcamentoExtraidoParaContextoExtracaoQueue', {
      eventBus: props.dominioBus,
      description:
        'Roteia OrcamentoExtraido/OrcamentoExtraidoComPendenciaConfirmada do bus de domínio para contexto-extracao-queue (T005).',
      eventPattern: {
        source: [SOURCE_EXTRACAO],
        detailType: [
          DETAIL_TYPE_ORCAMENTO_EXTRAIDO,
          DETAIL_TYPE_ORCAMENTO_EXTRAIDO_COM_PENDENCIA_CONFIRMADA,
        ],
      },
      targets: [new targets.SqsQueue(this.contextoExtracaoQueue)],
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
