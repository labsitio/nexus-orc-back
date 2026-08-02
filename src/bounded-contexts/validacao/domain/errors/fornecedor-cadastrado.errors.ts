import { ErroDominio } from './erro-dominio.js';

/**
 * Sinaliza que o sistema externo de cadastro de fornecedores está
 * indisponível (timeout, erro de rede ou 5xx) após esgotar as tentativas
 * configuradas em `FornecedorCadastradoHttpGateway` (Infrastructure, T022).
 * Vive no Domain — não na Infrastructure — porque `ValidarOrcamento`
 * (Application, T024) precisa capturá-la por `instanceof` para decidir a
 * política de fila (Princípio II: nunca bloquear o processamento de outros
 * orçamentos por causa de uma dependência externa indisponível); a
 * Application nunca deve importar de um path de Infrastructure para isso.
 */
export class FornecedorCadastradoIndisponivelError extends ErroDominio {
  constructor(mensagem: string) {
    super(`Sistema externo de cadastro de fornecedores indisponível — ${mensagem}`);
  }
}

/**
 * Sinaliza que a resposta do sistema externo de cadastro de fornecedores
 * não corresponde ao contrato esperado — traduzida por
 * `FornecedorCadastradoACL` (Infrastructure, T022). Mesma razão de estar no
 * Domain: quem decide política de retry/alerta sobre este erro é a
 * Application, não a Infrastructure.
 */
export class FornecedorCadastradoACLInvalidaError extends ErroDominio {
  constructor(mensagem: string) {
    super(`Resposta do sistema externo de cadastro de fornecedores inválida — ${mensagem}`);
  }
}
