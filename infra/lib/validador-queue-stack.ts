import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'validador-queue';
const DLQ_NAME = 'validador-queue-dlq';
/** `detailType` dos eventos do BC Extração que disparam validação (spec 002) — literais aqui de
 * propósito: infra CDK roda em Node com strip-only TS e não importa `src/` (parameter properties
 * do Domain não são suportadas nesse modo); manter em sincronia manual com os `detailType` reais. */
const DETAIL_TYPE_ORCAMENTO_EXTRAIDO = 'OrcamentoExtraido';
const DETAIL_TYPE_ORCAMENTO_EXTRAIDO_COM_PENDENCIA_CONFIRMADA =
  'OrcamentoExtraidoComPendenciaConfirmada';
/** `source` fixo do BC Extração no bus único (`eventbridge.publisher.ts` daquele BC). */
const SOURCE_EXTRACAO = 'nexo.extracao';

export interface ValidadorQueueStackProps extends StackProps {
  /** Bus de domínio já provisionado (`DominioEventBusStack`) — importado por referência, nunca recriado. */
  readonly dominioBus: events.IEventBus;
}

/**
 * Fila consumida por `ValidarOrcamento` (BC Validação, spec 003, T003/#113).
 * Único consumidor assíncrono desta spec — sem fila de revisor de IA, por
 * decisão de ADR-001 (plan.md §135/§205: escalonamento humano direto,
 * mecanismo de resolução de inconsistência determinístico). Regra EventBridge
 * roteia `OrcamentoExtraido`/`OrcamentoExtraidoComPendenciaConfirmada`
 * (source `nexo.extracao`) do bus único `nexo-dominio-bus` para esta fila
 * (T004/#114). DLQ + alarme CloudWatch em mensagem na DLQ — exceção de
 * infraestrutura nunca silenciosa (Princípio IV).
 */
export class ValidadorQueueStack extends Stack {
  public readonly validadorQueue: sqs.Queue;
  public readonly validadorQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: ValidadorQueueStackProps) {
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

    new events.Rule(this, 'OrcamentoExtraidoParaValidadorQueue', {
      eventBus: props.dominioBus,
      description:
        'Roteia OrcamentoExtraido/OrcamentoExtraidoComPendenciaConfirmada do bus de domínio para validador-queue (T004).',
      eventPattern: {
        source: [SOURCE_EXTRACAO],
        detailType: [
          DETAIL_TYPE_ORCAMENTO_EXTRAIDO,
          DETAIL_TYPE_ORCAMENTO_EXTRAIDO_COM_PENDENCIA_CONFIRMADA,
        ],
      },
      targets: [new targets.SqsQueue(this.validadorQueue)],
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
