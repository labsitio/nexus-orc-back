import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const QUEUE_NAME = 'decisao-workflow-queue';
const DLQ_NAME = 'decisao-workflow-queue-dlq';
/** `detailType` dos eventos do BC Validação que disparam a decisão de workflow (spec 003) — literais
 * aqui de propósito: infra CDK roda em Node com strip-only TS e não importa `src/` (parameter properties
 * do Domain não são suportadas nesse modo); manter em sincronia manual com os `detailType` reais quando
 * os Domain Events de Validação forem implementados (spec 003 ainda não publicou esses eventos). */
const DETAIL_TYPE_ORCAMENTO_VALIDADO = 'OrcamentoValidado';
const DETAIL_TYPE_ORCAMENTO_VALIDADO_COM_RESSALVA = 'OrcamentoValidadoComRessalva';
/** `source` fixo do BC Validação no bus único (mesma convenção `nexo.<bc>` das demais specs). */
const SOURCE_VALIDACAO = 'nexo.validacao';

export interface DecisaoWorkflowQueueStackProps extends StackProps {
  /** Bus de domínio já provisionado (`DominioEventBusStack`) — importado por referência, nunca recriado. */
  readonly dominioBus: events.IEventBus;
}

/**
 * Fila consumida por `ConsolidarEDecidirWorkflow` (BC Orquestração, spec 005,
 * T003/#209) — gatilho real da decisão de workflow (último evento da cadeia
 * causal). Regra EventBridge roteia `OrcamentoValidado`/
 * `OrcamentoValidadoComRessalva` (source `nexo.validacao`) do bus único
 * `nexo-dominio-bus` para esta fila (T006/#212). DLQ + alarme CloudWatch em
 * mensagem na DLQ é o mecanismo operacional que torna visível um contexto
 * que nunca se consolida (Princípio IV, plan.md §147, ADR-001).
 */
export class DecisaoWorkflowQueueStack extends Stack {
  public readonly decisaoWorkflowQueue: sqs.Queue;
  public readonly decisaoWorkflowQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: DecisaoWorkflowQueueStackProps) {
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

    new events.Rule(this, 'OrcamentoValidadoParaDecisaoWorkflowQueue', {
      eventBus: props.dominioBus,
      description:
        'Roteia OrcamentoValidado/OrcamentoValidadoComRessalva do bus de domínio para decisao-workflow-queue (T006).',
      eventPattern: {
        source: [SOURCE_VALIDACAO],
        detailType: [DETAIL_TYPE_ORCAMENTO_VALIDADO, DETAIL_TYPE_ORCAMENTO_VALIDADO_COM_RESSALVA],
      },
      targets: [new targets.SqsQueue(this.decisaoWorkflowQueue)],
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
