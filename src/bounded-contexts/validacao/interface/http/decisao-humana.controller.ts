import type { FastifyInstance } from 'fastify';
import {
  ConsultarStatusValidacao,
  OrcamentoValidacaoNaoEncontradoError,
} from '../../application/use-cases/consultar-status-validacao.js';
import { RegistrarDecisaoHumanaValidacao } from '../../application/use-cases/registrar-decisao-humana-validacao.js';
import {
  TransicaoInvalidaValidacaoError,
  type DecisaoHumanaValidacao,
  type OrcamentoValidacao,
} from '../../domain/orcamento-validacao.aggregate.js';
import {
  validarCamposObrigatorios,
  validarCnpjValido,
  validarPrazoCoerente,
} from '../../domain/regras-consistencia.js';
import {
  DadosExtraidosParaValidacao,
  DadosExtraidosParaValidacaoInvalidosError,
} from '../../domain/value-objects/dados-extraidos-para-validacao.vo.js';
import { OrcamentoIdInvalidoError } from '../../domain/value-objects/orcamento-id.vo.js';
import {
  PeriodoValidade,
  PeriodoValidadeInvalidoError,
} from '../../domain/value-objects/periodo-validade.vo.js';
import { paraResposta } from './status.controller.js';
import { orcamentoIdParamSchema } from './status.schema.js';
import { decisaoHumanaValidacaoRequestSchema } from './decisao-humana.schema.js';
import type { ProblemDetails } from './status.schema.js';
import type { RotaOpts } from './route-opts.js';

/**
 * Reavalia as 3 regras determinísticas sem I/O externo (CNPJ formato,
 * campos obrigatórios, prazo — T010) sobre os dados corrigidos informados na
 * decisão `CORRECAO_APLICADA`, mesclados por cima do `dadosExtraidos` atual
 * do agregado. `RegistrarDecisaoHumanaValidacao` (T035) espera receber
 * `inconsistencias` já recalculadas — recomputar é responsabilidade de quem
 * chama o caso de uso, conforme o próprio docstring do use case.
 *
 * ponytail: correção de item individual (`itens[]`) não é suportada nesta
 * primeira versão — só os 4 campos escalares de topo (`cnpjFornecedor`,
 * `condicoesComerciais`, `dataEmissaoProposta`, `periodoValidade`) são lidos
 * de `dadosCorrigidos`; o resto é ignorado silenciosamente pelo shape
 * `z.record` (mesma provisoriedade já registrada em `decisao-humana.schema.ts`).
 * `PRECO_FORA_DE_FAIXA`/`CNPJ_DIVERGENTE_CADASTRO` exigem gateway
 * (`ParametroFaixaPrecoGateway`/`FornecedorCadastradoGateway`, T022/T023) —
 * nunca recalculadas aqui, apenas carregadas do histórico para nunca
 * silenciar uma inconsistência real. Upgrade: se correção de preço ou de
 * CNPJ-cadastro via decisão humana virar cenário real, mover este recompute
 * para o caso de uso (T035), injetando os mesmos gateways de
 * `ValidarOrcamento`.
 */
function construirDecisaoParaCorrecao(
  validacaoAtual: OrcamentoValidacao,
  dadosCorrigidos: Record<string, unknown> | null | undefined,
): DecisaoHumanaValidacao {
  const atual = validacaoAtual.dadosExtraidos;
  const corrigidos = dadosCorrigidos ?? {};

  const dadosParaReavaliacao = DadosExtraidosParaValidacao.de({
    cnpjFornecedor:
      typeof corrigidos.cnpjFornecedor === 'string'
        ? corrigidos.cnpjFornecedor
        : atual.cnpjFornecedor,
    itens: atual.itens,
    condicoesComerciais:
      typeof corrigidos.condicoesComerciais === 'string'
        ? corrigidos.condicoesComerciais
        : atual.condicoesComerciais,
    dataEmissaoProposta:
      typeof corrigidos.dataEmissaoProposta === 'string'
        ? new Date(corrigidos.dataEmissaoProposta)
        : atual.dataEmissaoProposta,
    periodoValidade:
      typeof corrigidos.periodoValidade === 'string'
        ? PeriodoValidade.de(new Date(corrigidos.periodoValidade))
        : atual.periodoValidade,
  });

  const inconsistenciasRecalculadas = [
    ...validarCnpjValido(dadosParaReavaliacao),
    ...validarCamposObrigatorios(dadosParaReavaliacao),
    ...validarPrazoCoerente(dadosParaReavaliacao),
  ];

  const inconsistenciasMantidas = validacaoAtual.inconsistencias.filter(
    (inconsistencia) =>
      inconsistencia.regra === 'PRECO_FORA_DE_FAIXA' ||
      inconsistencia.regra === 'CNPJ_DIVERGENTE_CADASTRO',
  );

  return {
    tipo: 'CORRECAO_APLICADA',
    inconsistencias: [...inconsistenciasMantidas, ...inconsistenciasRecalculadas],
  };
}

/**
 * Controller (T036/#146): `POST /v1/orcamentos/{orcamentoId}/validacao/decisao-humana`.
 * Recebe `RegistrarDecisaoHumanaValidacao` (T035) e `ConsultarStatusValidacao`
 * (T026) já construídos — quem instancia repositório/publisher concretos é a
 * composição raiz do handler Lambda, fora deste arquivo (mesmo padrão de
 * `status.controller.ts` e `extracao/interface/http/revisao-humana.controller.ts`).
 *
 * 409 Problem Details quando a validação não está em `PENDENTE_REVISAO_HUMANA`
 * (mapeado a partir de `TransicaoInvalidaValidacaoError`, T030); 404 quando o
 * orçamento não tem validação registrada; 400 para body/params inválidos,
 * incluindo `dadosCorrigidos` que não reconstrói um `DadosExtraidosParaValidacao`
 * válido.
 */
export function registrarRotaDecisaoHumanaValidacao(
  app: FastifyInstance,
  registrarDecisaoHumanaValidacao: RegistrarDecisaoHumanaValidacao,
  consultarStatusValidacao: ConsultarStatusValidacao,
  opts: RotaOpts = {},
): void {
  app.post(
    '/v1/orcamentos/:orcamentoId/validacao/decisao-humana',
    { preHandler: opts.preHandler },
    async (request, reply) => {
      const params = orcamentoIdParamSchema.safeParse(request.params);
      if (!params.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title: 'orcamentoId inválido',
          status: 400,
          detail: params.error.issues.map((i) => i.message).join('; '),
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      const body = decisaoHumanaValidacaoRequestSchema.safeParse(request.body);
      if (!body.success) {
        const problema: ProblemDetails = {
          type: 'https://nexo.internal/problems/validacao',
          title:
            'Body inválido — decisao deve ser CORRECAO_APLICADA ou ACEITE_COM_RESSALVA, com justificativa',
          status: 400,
          detail: body.error.issues.map((i) => i.message).join('; '),
        };
        await reply.status(400).type('application/problem+json').send(problema);
        return;
      }

      try {
        const validacaoAtual = await consultarStatusValidacao.executar(params.data.orcamentoId);

        const decisao: DecisaoHumanaValidacao =
          body.data.decisao === 'ACEITE_COM_RESSALVA'
            ? { tipo: 'ACEITE_COM_RESSALVA' }
            : construirDecisaoParaCorrecao(validacaoAtual, body.data.dadosCorrigidos);

        await registrarDecisaoHumanaValidacao.executar(params.data.orcamentoId, decisao);

        const validacaoAtualizada = await consultarStatusValidacao.executar(
          params.data.orcamentoId,
        );
        await reply.status(200).send(paraResposta(validacaoAtualizada));
      } catch (erro) {
        if (
          erro instanceof OrcamentoValidacaoNaoEncontradoError ||
          erro instanceof OrcamentoIdInvalidoError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/nao-encontrado',
            title: 'Validação não encontrada',
            status: 404,
          };
          await reply.status(404).type('application/problem+json').send(problema);
          return;
        }
        if (erro instanceof TransicaoInvalidaValidacaoError) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/transicao-invalida',
            title: 'Ação não permitida para o estado atual do agregado',
            status: 409,
            detail: erro.message,
          };
          await reply.status(409).type('application/problem+json').send(problema);
          return;
        }
        if (
          erro instanceof DadosExtraidosParaValidacaoInvalidosError ||
          erro instanceof PeriodoValidadeInvalidoError
        ) {
          const problema: ProblemDetails = {
            type: 'https://nexo.internal/problems/validacao',
            title: 'dadosCorrigidos inválido',
            status: 400,
            detail: erro.message,
          };
          await reply.status(400).type('application/problem+json').send(problema);
          return;
        }
        throw erro;
      }
    },
  );
}
