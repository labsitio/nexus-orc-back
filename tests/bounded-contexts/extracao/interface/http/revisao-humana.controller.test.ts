import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registrarRotaRevisaoHumanaExtracao } from '../../../../../src/bounded-contexts/extracao/interface/http/revisao-humana.controller.js';
import {
  CaminhoConfirmacaoInvalidoError,
  ConfirmarRevisaoHumanaExtracao,
  ExtracaoNaoEncontradaError,
} from '../../../../../src/bounded-contexts/extracao/application/use-cases/confirmar-revisao-humana-extracao.js';
import { TransicaoInvalidaExtracaoError } from '../../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
import { ExtracaoOrcamento } from '../../../../../src/bounded-contexts/extracao/domain/extracao-orcamento.aggregate.js';
import { CampoExtraido } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/condicoes-comerciais.vo.js';
import { DescricaoProduto } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/descricao-produto.vo.js';
import { Dinheiro } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/dinheiro.vo.js';
import { ItemOrcamento } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/item-orcamento.vo.js';
import { Quantidade } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/quantidade.vo.js';
import { PeriodoValidade } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/periodo-validade.vo.js';
import { OrcamentoId } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/orcamento-id.vo.js';
import { ReferenciaClassificacao } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-classificacao.vo.js';
import { ReferenciaS3 } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/referencia-s3.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';

const ORCAMENTO_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const confianca = NivelConfianca.de(95);

/** Instância mínima do agregado, já em `EXTRAIDO` após confirmação — só o
 * necessário para `paraResposta` do controller conseguir mapear a resposta. */
function extracaoExtraida(): ExtracaoOrcamento {
  const extracao = ExtracaoOrcamento.criar(
    OrcamentoId.de(ORCAMENTO_ID),
    ReferenciaClassificacao.de({
      fornecedorIdentificado: 'F',
      formatoIdentificado: 'PDF',
      agenteOrigem: 'CLASSIFICADOR',
    }),
    ReferenciaS3.de({ bucket: 'b', key: 'k', versionId: 'v' }),
  );
  const item = ItemOrcamento.de({
    descricao: CampoExtraido.extraido(DescricaoProduto.de('Parafuso'), confianca, 'EXTRATOR'),
    quantidade: CampoExtraido.extraido(Quantidade.de(10), confianca, 'EXTRATOR'),
    precoUnitario: CampoExtraido.extraido(Dinheiro.de(320, 'BRL'), confianca, 'EXTRATOR'),
  });
  extracao.registrarTentativaExtrator(
    [item],
    CondicoesComerciais.de({
      condicoesPagamento: CampoExtraido.extraido('30 dias', confianca, 'EXTRATOR'),
      prazoValidade: CampoExtraido.extraido(
        PeriodoValidade.de(new Date('2026-12-31')),
        confianca,
        'EXTRATOR',
      ),
      condicoesEntrega: CampoExtraido.extraido('FOB', confianca, 'EXTRATOR'),
    }),
  );
  return extracao;
}

function appComRota(confirmar: ConfirmarRevisaoHumanaExtracao) {
  const app = Fastify();
  registrarRotaRevisaoHumanaExtracao(app, confirmar);
  return app;
}

function corpoValido() {
  return {
    camposConfirmados: [
      { caminho: 'condicoesComerciais.prazoValidade', valor: null, indisponivel: true },
    ],
  };
}

describe('POST /v1/orcamentos/{orcamentoId}/extracao/revisao-humana', () => {
  it('200 com StatusExtracaoResponse quando confirmação é aplicada', async () => {
    const executar = vi.fn().mockResolvedValue(extracaoExtraida());
    const confirmar = { executar } as unknown as ConfirmarRevisaoHumanaExtracao;
    const app = appComRota(confirmar);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${ORCAMENTO_ID}/extracao/revisao-humana`,
      payload: corpoValido(),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ orcamentoId: ORCAMENTO_ID, status: 'EXTRAIDO' });
    expect(resposta.json().itens).toHaveLength(1);
    expect(executar).toHaveBeenCalledWith({
      orcamentoId: ORCAMENTO_ID,
      camposConfirmados: corpoValido().camposConfirmados,
    });
    await app.close();
  });

  it('400 Problem Details quando orcamentoId não é UUID', async () => {
    const confirmar = { executar: vi.fn() } as unknown as ConfirmarRevisaoHumanaExtracao;
    const app = appComRota(confirmar);

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/orcamentos/nao-e-uuid/extracao/revisao-humana',
      payload: corpoValido(),
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });

  it('400 Problem Details quando body é inválido (camposConfirmados vazio)', async () => {
    const confirmar = { executar: vi.fn() } as unknown as ConfirmarRevisaoHumanaExtracao;
    const app = appComRota(confirmar);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${ORCAMENTO_ID}/extracao/revisao-humana`,
      payload: { camposConfirmados: [] },
    });

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it('404 Problem Details quando extração não é encontrada', async () => {
    const executar = vi.fn().mockRejectedValue(new ExtracaoNaoEncontradaError(ORCAMENTO_ID));
    const confirmar = { executar } as unknown as ConfirmarRevisaoHumanaExtracao;
    const app = appComRota(confirmar);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${ORCAMENTO_ID}/extracao/revisao-humana`,
      payload: corpoValido(),
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });

  it('400 Problem Details quando caminho de confirmação é inválido', async () => {
    const executar = vi
      .fn()
      .mockRejectedValue(
        new CaminhoConfirmacaoInvalidoError('itens[9].descricao', 'fora do intervalo'),
      );
    const confirmar = { executar } as unknown as ConfirmarRevisaoHumanaExtracao;
    const app = appComRota(confirmar);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${ORCAMENTO_ID}/extracao/revisao-humana`,
      payload: corpoValido(),
    });

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it('409 Problem Details quando extração não está PENDENTE_REVISAO_HUMANA', async () => {
    const executar = vi
      .fn()
      .mockRejectedValue(
        new TransicaoInvalidaExtracaoError('EXTRAIDO', 'registrarConfirmacaoHumana'),
      );
    const confirmar = { executar } as unknown as ConfirmarRevisaoHumanaExtracao;
    const app = appComRota(confirmar);

    const resposta = await app.inject({
      method: 'POST',
      url: `/v1/orcamentos/${ORCAMENTO_ID}/extracao/revisao-humana`,
      payload: corpoValido(),
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });
});
