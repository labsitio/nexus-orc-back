/**
 * Seed do LocalStack para execução local (spec 001 T067 / issue #589).
 *
 * O LocalStack sobe vazio: nem bucket, nem bus, nem filas, nem regras existem.
 * Este script cria o mínimo para o fluxo de 001 → 002 rodar, com os **mesmos
 * nomes de recurso** das stacks CDK de produção (`infra/lib/*-stack.ts`) — se
 * um nome divergir aqui, o teste local deixa de dizer algo sobre produção.
 *
 * Não substitui as stacks CDK: é o equivalente mínimo delas para desenvolvimento.
 * Idempotente — rodar duas vezes não quebra.
 */
import { CreateBucketCommand, GetBucketVersioningCommand, S3Client } from '@aws-sdk/client-s3';
import {
  CreateEventBusCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SQSClient,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';

import { clientesLocais, configLocal } from './config.js';

/**
 * Espelha `infra/lib/*-queue-stack.ts` (nome de fila/DLQ/regra, `source` e
 * `detailType` — literais copiados de lá, ver comentário de cada stack).
 * `regra` reaproveita o mesmo nome do `id` lógico do `events.Rule` da stack
 * CDK correspondente — divergir aqui invalida o teste local.
 */
const SOURCE_INGESTAO = 'nexo.ingestao-identificacao';
const SOURCE_EXTRACAO = 'nexo.extracao';
const SOURCE_VALIDACAO = 'nexo.validacao';

const FILAS = [
  {
    nome: 'classificador-queue',
    dlq: 'classificador-queue-dlq',
    regra: 'OrcamentoRecebidoParaClassificadorQueue',
    source: SOURCE_INGESTAO,
    detailTypes: ['OrcamentoRecebido'],
  },
  {
    nome: 'extrator-queue',
    dlq: 'extrator-queue-dlq',
    regra: 'OrcamentoClassificadoParaExtratorQueue',
    source: SOURCE_INGESTAO,
    detailTypes: ['OrcamentoClassificado', 'OrcamentoReclassificadoPorRevisaoHumana'],
  },
  {
    nome: 'validador-queue',
    dlq: 'validador-queue-dlq',
    regra: 'OrcamentoExtraidoParaValidadorQueue',
    source: SOURCE_EXTRACAO,
    detailTypes: ['OrcamentoExtraido', 'OrcamentoExtraidoComPendenciaConfirmada'],
  },
  {
    nome: 'contexto-classificacao-queue',
    dlq: 'contexto-classificacao-queue-dlq',
    regra: 'OrcamentoClassificadoParaContextoClassificacaoQueue',
    source: SOURCE_INGESTAO,
    detailTypes: ['OrcamentoClassificado', 'OrcamentoReclassificadoPorRevisaoHumana'],
  },
  {
    nome: 'contexto-extracao-queue',
    dlq: 'contexto-extracao-queue-dlq',
    regra: 'OrcamentoExtraidoParaContextoExtracaoQueue',
    source: SOURCE_EXTRACAO,
    detailTypes: ['OrcamentoExtraido', 'OrcamentoExtraidoComPendenciaConfirmada'],
  },
  {
    nome: 'indexador-queue',
    dlq: 'indexador-queue-dlq',
    regra: 'OrcamentoValidadoParaIndexadorQueue',
    source: SOURCE_VALIDACAO,
    detailTypes: ['OrcamentoValidado', 'OrcamentoValidadoComRessalva'],
  },
  {
    nome: 'decisao-workflow-queue',
    dlq: 'decisao-workflow-queue-dlq',
    regra: 'OrcamentoValidadoParaDecisaoWorkflowQueue',
    source: SOURCE_VALIDACAO,
    detailTypes: ['OrcamentoValidado', 'OrcamentoValidadoComRessalva'],
  },
] as const;

/** Igual ao `maxReceiveCount` das stacks CDK — redelivery e DLQ observáveis localmente. */
const MAX_RECEIVE_COUNT = 3;

function ehJaExiste(erro: unknown): boolean {
  if (!(erro instanceof Error)) {
    return false;
  }
  return (
    erro.name === 'BucketAlreadyOwnedByYou' ||
    erro.name === 'BucketAlreadyExists' ||
    erro.name === 'ResourceAlreadyExistsException' ||
    erro.name === 'QueueAlreadyExists'
  );
}

async function ignorandoJaExiste(acao: () => Promise<unknown>): Promise<void> {
  try {
    await acao();
  } catch (erro) {
    if (!ehJaExiste(erro)) {
      throw erro;
    }
  }
}

async function criarBucket(s3: S3Client, bucket: string): Promise<void> {
  // Object Lock habilitado na criação: `gerarUrlUpload` assina o PUT com
  // `ObjectLockMode: GOVERNANCE`, e Object Lock não pode ser habilitado depois
  // que o bucket existe.
  await ignorandoJaExiste(() =>
    s3.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true })),
  );

  // Object Lock implica versionamento (e um PutBucketVersioning sobre bucket com
  // Object Lock é rejeitado com `InvalidBucketState`), então aqui só se verifica.
  // A checagem não é decorativa: `confirmarUpload` aborta explicitamente quando
  // o HeadObject volta sem `VersionId`.
  const versionamento = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }));
  if (versionamento.Status !== 'Enabled') {
    throw new Error(
      `bucket "${bucket}" está com versionamento "${versionamento.Status ?? 'desabilitado'}" — ` +
        'o fluxo de upload exige VersionId em todo objeto',
    );
  }
}

async function criarFilaComDlq(
  sqs: SQSClient,
  nome: string,
  dlq: string,
): Promise<{ url: string; arn: string }> {
  // `CreateQueue` é idempotente para o mesmo nome+atributos — nada a capturar aqui.
  const dlqUrl = (await sqs.send(new CreateQueueCommand({ QueueName: dlq }))).QueueUrl;
  const dlqArn = (
    await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['QueueArn'] }),
    )
  ).Attributes?.QueueArn;
  if (!dlqArn) {
    throw new Error(`DLQ "${dlq}" criada sem QueueArn — LocalStack respondeu incompleto`);
  }

  const url = (await sqs.send(new CreateQueueCommand({ QueueName: nome }))).QueueUrl;
  if (!url) {
    throw new Error(`Fila "${nome}" criada sem QueueUrl — LocalStack respondeu incompleto`);
  }
  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: url,
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: dlqArn,
          maxReceiveCount: MAX_RECEIVE_COUNT,
        }),
      },
    }),
  );

  const arn = (
    await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['QueueArn'] }))
  ).Attributes?.QueueArn;
  if (!arn) {
    throw new Error(`Fila "${nome}" sem QueueArn — LocalStack respondeu incompleto`);
  }
  return { url, arn };
}

async function main(): Promise<void> {
  const { bucket, eventBusName } = configLocal();
  const { s3, eventBridge, sqs } = clientesLocais();

  await criarBucket(s3, bucket);
  console.log(`bucket ${bucket}: pronto (Object Lock + versionamento)`);

  await ignorandoJaExiste(() =>
    eventBridge.send(new CreateEventBusCommand({ Name: eventBusName })),
  );
  console.log(`bus ${eventBusName}: pronto`);

  for (const fila of FILAS) {
    const { url, arn } = await criarFilaComDlq(sqs, fila.nome, fila.dlq);

    await eventBridge.send(
      new PutRuleCommand({
        Name: fila.regra,
        EventBusName: eventBusName,
        EventPattern: JSON.stringify({
          source: [fila.source],
          'detail-type': fila.detailTypes,
        }),
      }),
    );
    await eventBridge.send(
      new PutTargetsCommand({
        Rule: fila.regra,
        EventBusName: eventBusName,
        Targets: [{ Id: fila.nome, Arn: arn }],
      }),
    );
    console.log(
      `fila ${fila.nome} + DLQ + regra ${fila.regra} (${fila.detailTypes.join(', ')}): pronto`,
    );
    console.log(`  url: ${url}`);
  }

  // ponytail: sem policy de fila autorizando events.amazonaws.com — LocalStack
  // não aplica IAM, e é justamente por isso que este seed NÃO prova nada sobre
  // permissão em produção (ver ADR-004 / issues #576-#580).
  console.log('\nseed concluído. Permissões IAM NÃO são exercitadas aqui (LocalStack ignora IAM).');
}

await main();
