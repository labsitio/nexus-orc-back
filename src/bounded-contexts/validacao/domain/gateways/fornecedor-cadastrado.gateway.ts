import type { CNPJ } from '../value-objects/cnpj.vo.js';

/**
 * Verifica compatibilidade do CNPJ extraído com o cadastro de fornecedores
 * já existente — regra de negócio separada da validação de formato/dígito
 * verificador do VO `CNPJ` (plan.md). Cliente para sistema externo fora do
 * escopo de criação desta spec: implementado na Infrastructure
 * (`FornecedorCadastradoHttpGateway`, T022) com timeout curto e retry
 * limitado, nunca bloqueando o processamento de outros orçamentos na fila
 * caso o sistema externo esteja indisponível (Princípio II). Resposta
 * externa é sempre traduzida por `FornecedorCadastradoACL` antes de chegar
 * aqui — nunca cruza para o Domain sem tradução.
 */
export interface FornecedorCadastradoGateway {
  estaCadastrado(cnpj: CNPJ): Promise<boolean>;
}
