import { ErroDominio } from './erro-dominio.js';

/**
 * Sinaliza que o payload bruto do evento `OrcamentoClassificado`
 * (`source: nexo.ingestao-identificacao`, spec 001) não corresponde ao
 * contrato mínimo esperado — traduzido por `OrcamentoClassificadoEventACL`
 * (Infrastructure, T017). Vive no Domain, não na Infrastructure: quem decide
 * a política de fila/DLQ sobre este erro é a Application (mesma razão de
 * `FornecedorCadastradoACLInvalidaError`, spec 003).
 */
export class OrcamentoClassificadoEventACLInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`Payload de OrcamentoClassificado inválido — ${mensagem}`);
  }
}

/**
 * Sinaliza que o payload bruto dos eventos `OrcamentoExtraido`/
 * `OrcamentoExtraidoComPendenciaConfirmada` (`source: nexo.extracao`, spec 002)
 * não corresponde ao contrato mínimo esperado — traduzido por
 * `OrcamentoExtraidoEventACL` (Infrastructure, T017).
 */
export class OrcamentoExtraidoEventACLInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`Payload de OrcamentoExtraido inválido — ${mensagem}`);
  }
}

/**
 * Sinaliza que o payload bruto dos eventos `OrcamentoValidado`/
 * `OrcamentoValidadoComRessalva` (`source: nexo.validacao`, spec 003) não
 * corresponde ao contrato mínimo esperado — traduzido por
 * `OrcamentoValidadoEventACL` (Infrastructure, T017).
 */
export class OrcamentoValidadoEventACLInvalidoError extends ErroDominio {
  constructor(mensagem: string) {
    super(`Payload de OrcamentoValidado inválido — ${mensagem}`);
  }
}
