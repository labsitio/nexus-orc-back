import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'extrator-queue';
const DLQ_NAME = 'extrator-queue-dlq';
/** `detailType` dos eventos do BC Ingestão & Identificação que disparam extração (spec 001) — literais
 * aqui de propósito: infra CDK roda em Node com strip-only TS e não importa `src/` (parameter properties
 * do Domain não são suportadas nesse modo); manter em sincronia manual com os `detailType` reais. */
const DETAIL_TYPE_ORCAMENTO_CLASSIFICADO = 'OrcamentoClassificado';
/** Publicado por `ConfirmarRevisaoHumana` (spec 001, T055/#60) — reaproveita o shape de
 * `OrcamentoClassificado` com `agenteOrigem: 'HUMANO'` (issue #744). */
const DETAIL_TYPE_ORCAMENTO_RECLASSIFICADO_POR_REVISAO_HUMANA =
  'OrcamentoReclassificadoPorRevisaoHumana';
/** `source` fixo do BC Ingestão & Identificação no bus único (`eventbridge.publisher.ts` daquele BC). */
const SOURCE_INGESTAO_IDENTIFICACAO = 'nexo.ingestao-identificacao';

export interface ExtratorQueueStackProps extends StackProps {
  /** Bus de domínio já provisionado (`DominioEventBusStack`) — importado por referência, nunca recriado. */
  readonly dominioBus: events.IEventBus;
}

/**
 * Fila consumida por `ExtrairDadosOrcamento` (BC Extração, T003/#68). Regra
 * EventBridge roteia `OrcamentoClassificado` (source `nexo.ingestao-identificacao`)
 * do bus único `nexo-dominio-bus` para esta fila (T004/#69). DLQ + alarme
 * CloudWatch em mensagem na DLQ — exceção de infraestrutura nunca silenciosa
 * (Princípio IV, plan.md §134).
 */
export class ExtratorQueueStack extends Stack {
  public readonly extratorQueue: sqs.Queue;
  public readonly extratorQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: ExtratorQueueStackProps) {
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

    new events.Rule(this, 'OrcamentoClassificadoParaExtratorQueue', {
      eventBus: props.dominioBus,
      description:
        'Roteia OrcamentoClassificado/OrcamentoReclassificadoPorRevisaoHumana do bus de domínio para extrator-queue (T004, #744).',
      eventPattern: {
        source: [SOURCE_INGESTAO_IDENTIFICACAO],
        detailType: [
          DETAIL_TYPE_ORCAMENTO_CLASSIFICADO,
          DETAIL_TYPE_ORCAMENTO_RECLASSIFICADO_POR_REVISAO_HUMANA,
        ],
      },
      targets: [new targets.SqsQueue(this.extratorQueue)],
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
