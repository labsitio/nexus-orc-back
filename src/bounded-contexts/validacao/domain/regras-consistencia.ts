import { CNPJ, CnpjInvalidoError } from './value-objects/cnpj.vo.js';
import type { DadosExtraidosParaValidacao } from './value-objects/dados-extraidos-para-validacao.vo.js';
import type { FaixaPreco } from './value-objects/faixa-preco.vo.js';
import { InconsistenciaDetectada } from './value-objects/inconsistencia-detectada.vo.js';

/**
 * As 4 regras determinísticas de consistência (T010) — funções puras,
 * testáveis isoladamente, sem mock de IA ou rede. Compatibilidade de CNPJ
 * com cadastro conhecido (`CNPJ_DIVERGENTE_CADASTRO`) e categorização de
 * item via IA generativa não são regras determinísticas: ficam na
 * Application (`ValidarOrcamento`, T024), que consulta os gateways
 * correspondentes antes de chamar estas funções.
 */

/**
 * Regra 1 — CNPJ válido: formato (14 dígitos) + dígito verificador,
 * determinístico, sem chamada externa. `cnpjFornecedor` chega como string
 * bruta traduzida pelo ACL (T015) — só vira o VO `CNPJ` se passar aqui.
 */
export function validarCnpjValido(dados: DadosExtraidosParaValidacao): InconsistenciaDetectada[] {
  try {
    CNPJ.de(dados.cnpjFornecedor);
    return [];
  } catch (erro) {
    if (erro instanceof CnpjInvalidoError) {
      return [InconsistenciaDetectada.de('CNPJ_INVALIDO', erro.message)];
    }
    throw erro;
  }
}

/**
 * Regra 2 — campos obrigatórios preenchidos. Item com `extraido: false`
 * (pendência confirmada pela Extração) ainda reprova aqui se o campo
 * obrigatório (`descricao`) estiver ausente — Validação nunca herda a
 * decisão de aceite da Extração (plan.md, decisão de negócio registrada
 * no agregado `OrcamentoValidacao`).
 */
export function validarCamposObrigatorios(
  dados: DadosExtraidosParaValidacao,
): InconsistenciaDetectada[] {
  return dados.itens.flatMap((item, indice) =>
    item.descricao === undefined
      ? [
          InconsistenciaDetectada.de(
            'CAMPO_OBRIGATORIO_AUSENTE',
            'descrição do item não informada',
            `item-${indice}`,
          ),
        ]
      : [],
  );
}

/**
 * Regra 3 — preço dentro da faixa esperada por categoria. `faixasPreco` é
 * carregado pela Application via `ParametroFaixaPrecoGateway` (T023,
 * tabela `faixas_preco_categoria`), nunca hardcoded aqui. Item ainda sem
 * `categoria` (categorização não é responsabilidade desta regra — a
 * Application garante categorização antes de chamar esta função) ou sem
 * faixa configurada para a categoria não é reprovado por esta regra.
 */
export function validarPrecoDentroDaFaixa(
  dados: DadosExtraidosParaValidacao,
  faixasPreco: readonly FaixaPreco[],
): InconsistenciaDetectada[] {
  return dados.itens.flatMap((item, indice) => {
    if (!item.categoria) {
      return [];
    }
    const categoria = item.categoria;
    const faixa = faixasPreco.find((candidata) => candidata.categoria.equals(categoria));
    if (!faixa || faixa.contem(item.precoUnitario)) {
      return [];
    }
    return [
      InconsistenciaDetectada.de(
        'PRECO_FORA_DE_FAIXA',
        `preço unitário fora da faixa esperada para a categoria "${categoria.paraPayload()}"`,
        `item-${indice}`,
      ),
    ];
  });
}

/**
 * Regra 4 — coerência de prazo de validade: `periodoValidade.validoAte`
 * MUST ser posterior a `dataEmissaoProposta` (ver dependência de campo
 * registrada no Constitution Check do plan.md).
 */
export function validarPrazoCoerente(
  dados: DadosExtraidosParaValidacao,
): InconsistenciaDetectada[] {
  if (dados.periodoValidade.validoAte.getTime() <= dados.dataEmissaoProposta.getTime()) {
    return [
      InconsistenciaDetectada.de(
        'PRAZO_INCOERENTE',
        'prazo de validade da proposta não é posterior à data de emissão',
      ),
    ];
  }
  return [];
}
