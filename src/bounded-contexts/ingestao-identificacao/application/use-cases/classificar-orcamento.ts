import { createHash } from 'node:crypto';
import type { AgenteClassificadorGateway } from '../../domain/gateways/agente-classificador.gateway.js';
import type { ArmazenamentoBrutoGateway } from '../../domain/gateways/armazenamento-bruto.gateway.js';
import type { CacheIdentificacaoGateway } from '../../domain/gateways/cache-identificacao.gateway.js';
import type { EventPublisher } from '../../domain/gateways/event-publisher.js';
import type { MarkItDownConversaoACL } from '../../domain/gateways/markitdown-conversao.acl.js';
import { ErroDominio } from '../../domain/errors/erro-dominio.js';
import { OrcamentoClassificado } from '../../domain/events/orcamento-classificado.event.js';
import { OrcamentoEscalonadoParaRevisaoHumana } from '../../domain/events/orcamento-escalonado-revisao-humana.event.js';
import { AssinaturaEstrutural } from '../../domain/value-objects/assinatura-estrutural.js';
import { NivelConfianca } from '../../domain/value-objects/nivel-confianca.vo.js';
import { OrcamentoId } from '../../domain/value-objects/orcamento-id.vo.js';
import { ResultadoClassificacao } from '../../domain/value-objects/resultado-classificacao.vo.js';
import type { OrcamentoRepository } from '../../domain/repositories/orcamento.repository.js';

export class OrcamentoNaoEncontradoParaClassificacaoError extends ErroDominio {
  constructor(orcamentoId: string) {
    super(`Orçamento não encontrado para classificação: ${orcamentoId}`);
  }
}

/**
 * Consumidor do evento `OrcamentoRecebido` via SQS `classificador-queue`
 * (T033/#38, T034/#39). Busca o arquivo bruto, converte via
 * `MarkItDownConversaoACL` (T030), invoca `AgenteClassificadorGateway`
 * (T031), aplica `Orcamento.registrarTentativaClassificador` (T027) e
 * publica `OrcamentoClassificado` (>=80%) ou
 * `OrcamentoEscalonadoParaRevisaoHumana` (<80%) — nunca decide o evento
 * fora da regra do agregado (plan.md).
 */
export class ClassificarOrcamento {
  constructor(
    private readonly repositorio: OrcamentoRepository,
    private readonly armazenamentoBruto: ArmazenamentoBrutoGateway,
    private readonly conversor: MarkItDownConversaoACL,
    private readonly agenteClassificador: AgenteClassificadorGateway,
    private readonly eventPublisher: EventPublisher,
    private readonly cacheIdentificacao?: CacheIdentificacaoGateway,
  ) {}

  async executar(orcamentoIdBruto: string): Promise<void> {
    const id = OrcamentoId.de(orcamentoIdBruto);
    const orcamento = await this.repositorio.buscarPorId(id);
    if (!orcamento) {
      throw new OrcamentoNaoEncontradoParaClassificacaoError(orcamentoIdBruto);
    }

    const conteudoBruto = await this.armazenamentoBruto.lerConteudoBruto(orcamento.referenciaBruta);
    const nomeArquivo =
      orcamento.referenciaBruta.key.split('/').at(-1) ?? orcamento.referenciaBruta.key;
    const textoDocumento = await this.conversor.converterParaTexto(conteudoBruto, nomeArquivo);

    // Consulta best-effort ao cache de identificação (T012/spec-009): falha de
    // leitura (throttle, timeout) MUST degradar para cache-miss silencioso,
    // nunca bloquear ou falhar o caminho de custo total via Bedrock. O uso do
    // sinal de hit como contexto do agente é escopo de T016, ainda não ligado.
    if (this.cacheIdentificacao) {
      try {
        const assinatura = AssinaturaEstrutural.de(
          createHash('sha256').update(textoDocumento).digest('hex'),
        );
        await this.cacheIdentificacao.buscar(assinatura);
      } catch {
        // cache-miss silencioso — segue para classificação normal via Bedrock.
      }
    }

    const resultadoBruto = await this.agenteClassificador.classificar(textoDocumento);
    const resultado = ResultadoClassificacao.criar({
      fornecedorIdentificado: resultadoBruto.fornecedorIdentificado,
      formatoIdentificado: resultadoBruto.formatoIdentificado,
      nivelConfianca: NivelConfianca.de(resultadoBruto.nivelConfianca),
      agenteOrigem: 'CLASSIFICADOR',
    });

    orcamento.registrarTentativaClassificador(resultado);
    await this.repositorio.salvar(orcamento);

    const evento =
      orcamento.status === 'CLASSIFICADO'
        ? new OrcamentoClassificado(orcamento.id.toString(), resultado.paraPayload(), {
            bucket: orcamento.referenciaBruta.bucket,
            key: orcamento.referenciaBruta.key,
            versionId: orcamento.referenciaBruta.versionId,
          })
        : new OrcamentoEscalonadoParaRevisaoHumana(
            orcamento.id.toString(),
            resultado.paraPayload(),
          );
    await this.eventPublisher.publicar(evento);
  }
}
