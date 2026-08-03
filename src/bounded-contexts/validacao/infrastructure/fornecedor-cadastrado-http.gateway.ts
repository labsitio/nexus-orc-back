import { ErroDominio } from '../domain/errors/erro-dominio.js';
import { FornecedorCadastradoIndisponivelError } from '../domain/errors/fornecedor-cadastrado.errors.js';
import type { CNPJ } from '../domain/value-objects/cnpj.vo.js';
import type { FornecedorCadastradoGateway } from '../domain/gateways/fornecedor-cadastrado.gateway.js';
import { FornecedorCadastradoACL } from './fornecedor-cadastrado.acl.js';

export { FornecedorCadastradoIndisponivelError };

/** Timeout curto e retry limitado — plan.md, seção Segurança (T022). */
const TIMEOUT_MS_PADRAO = 2000;
const MAX_TENTATIVAS_PADRAO = 2;

/** Falha definitiva (não transitória) — nunca vale a pena retentar. */
class FalhaNaoRetentavel extends Error {
  constructor(readonly causa: unknown) {
    super('falha não retentável');
  }
}

/**
 * Implementa `FornecedorCadastradoGateway` sobre HTTP contra o sistema
 * externo de cadastro de fornecedores (fora do escopo de criação desta
 * spec — plan.md, seção Infrastructure). Protocolo/contrato exato ainda a
 * confirmar com Ricardo/produto (registrado como risco remanescente);
 * assume-se `GET {baseUrl}/fornecedores/{cnpj}` retornando
 * `{ cadastrado: boolean }` como contrato mínimo de trabalho.
 *
 * Primeira integração síncrona desta arquitetura com um sistema fora do
 * controle direto do produto (plan.md, seção Segurança): timeout curto por
 * tentativa (`AbortController`) e retry limitado apenas para falhas
 * transitórias (rede, timeout, 5xx) — um erro 4xx ou uma resposta
 * malformada não é retentado, pois retry não resolveria. Esgotadas as
 * tentativas, lança `FornecedorCadastradoIndisponivelError`: nunca lança a
 * exceção original nem propaga indefinidamente, para que o chamador (fila
 * SQS, item-a-item) decida a política sem travar o processamento de outros
 * orçamentos (Princípio II).
 *
 * A resposta é sempre traduzida por `FornecedorCadastradoACL` antes de
 * cruzar para o Domain — nunca o JSON externo cru.
 *
 * Arquivo direto em `infrastructure/`, não em `infrastructure/external/`
 * como a árvore ilustrativa do plan.md sugere — mesmo padrão já
 * estabelecido neste BC por `eventbridge.publisher.ts` (que também não
 * está em `infrastructure/aws/`); divergência de organização em
 * subpastas, não de camada, mantida por consistência com o código já
 * mergeado.
 */
export class FornecedorCadastradoHttpGateway implements FornecedorCadastradoGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs: number = TIMEOUT_MS_PADRAO,
    private readonly maxTentativas: number = MAX_TENTATIVAS_PADRAO,
    private readonly acl: FornecedorCadastradoACL = new FornecedorCadastradoACL(),
  ) {}

  async estaCadastrado(cnpj: CNPJ): Promise<boolean> {
    let ultimoErro: unknown;

    for (let tentativa = 1; tentativa <= this.maxTentativas; tentativa++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const resposta = await this.fetchFn(`${this.baseUrl}/fornecedores/${cnpj.paraPayload()}`, {
          signal: controller.signal,
        });

        if (resposta.status >= 500) {
          throw new Error(`sistema externo respondeu ${resposta.status}`);
        }
        if (!resposta.ok) {
          // 4xx: retry não resolveria — falha definitiva desta consulta.
          throw new FalhaNaoRetentavel(
            new FornecedorCadastradoIndisponivelError(
              `sistema externo respondeu ${resposta.status} para CNPJ ${cnpj.paraPayload()}`,
            ),
          );
        }

        const corpo: unknown = await resposta.json();
        try {
          return this.acl.converter(corpo);
        } catch (erroAcl) {
          throw new FalhaNaoRetentavel(erroAcl);
        }
      } catch (erro) {
        ultimoErro = erro instanceof FalhaNaoRetentavel ? erro.causa : erro;
        if (erro instanceof FalhaNaoRetentavel || tentativa === this.maxTentativas) {
          break;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (ultimoErro instanceof ErroDominio) {
      throw ultimoErro;
    }
    throw new FornecedorCadastradoIndisponivelError(
      `esgotadas ${this.maxTentativas} tentativa(s) para CNPJ ${cnpj.paraPayload()}: ` +
        `${ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)}`,
    );
  }
}
