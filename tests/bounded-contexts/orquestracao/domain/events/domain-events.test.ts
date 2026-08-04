import { describe, expect, it } from 'vitest';
import { DecisaoWorkflowEscalonadaParaComprador } from '../../../../../src/bounded-contexts/orquestracao/domain/events/decisao-workflow-escalonada-para-comprador.event.js';
import { IntegracaoExternaSolicitada } from '../../../../../src/bounded-contexts/orquestracao/domain/events/integracao-externa-solicitada.event.js';
import { OrcamentoAprovadoParaProcessamento } from '../../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-aprovado-para-processamento.event.js';
import { OrcamentoEncaminhadoParaComprador } from '../../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-encaminhado-para-comprador.event.js';
import { OrcamentoReenvioSolicitado } from '../../../../../src/bounded-contexts/orquestracao/domain/events/orcamento-reenvio-solicitado.event.js';

const orcamentoId = '018f4b1a-0000-7000-8000-000000000000';
const tenantId = '018f4b1a-tenant-0000-0000-000000000000';

describe.each([
  {
    nome: 'OrcamentoAprovadoParaProcessamento',
    detailType: 'OrcamentoAprovadoParaProcessamento',
    criar: () =>
      new OrcamentoAprovadoParaProcessamento(
        orcamentoId,
        'ORQUESTRADOR',
        'confiança 95',
        95,
        tenantId,
      ),
  },
  {
    nome: 'OrcamentoEncaminhadoParaComprador',
    detailType: 'OrcamentoEncaminhadoParaComprador',
    criar: () =>
      new OrcamentoEncaminhadoParaComprador(
        orcamentoId,
        'HUMANO',
        'decisão do comprador',
        null,
        tenantId,
      ),
  },
  {
    nome: 'OrcamentoReenvioSolicitado',
    detailType: 'OrcamentoReenvioSolicitado',
    criar: () =>
      new OrcamentoReenvioSolicitado(
        orcamentoId,
        'ORQUESTRADOR',
        'CNPJ ausente no item 3',
        90,
        'CNPJ do fornecedor ausente no item 3',
        tenantId,
      ),
  },
  {
    nome: 'IntegracaoExternaSolicitada',
    detailType: 'IntegracaoExternaSolicitada',
    criar: () => new IntegracaoExternaSolicitada(orcamentoId, 'APROVAR', tenantId),
  },
  {
    nome: 'DecisaoWorkflowEscalonadaParaComprador',
    detailType: 'DecisaoWorkflowEscalonadaParaComprador',
    criar: () => new DecisaoWorkflowEscalonadaParaComprador(orcamentoId, 62, tenantId),
  },
])('$nome', ({ detailType, criar }) => {
  it(`schemaVersion 2, orcamentoId, tenantId e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(2);
    expect(evento.orcamentoId).toBe(orcamentoId);
    expect(evento.tenantId).toBe(tenantId);
    expect(evento.detailType).toBe(detailType);
    expect(() => new Date(evento.ocorreuEm)).not.toThrow();
    expect(new Date(evento.ocorreuEm).toISOString()).toBe(evento.ocorreuEm);
  });
});

describe('OrcamentoReenvioSolicitado', () => {
  it('carrega motivoDadoAusente não vazio, referenciando a pendência concreta', () => {
    const evento = new OrcamentoReenvioSolicitado(
      orcamentoId,
      'ORQUESTRADOR',
      'CNPJ ausente no item 3',
      90,
      'CNPJ do fornecedor ausente no item 3',
      tenantId,
    );
    expect(evento.motivoDadoAusente).toBe('CNPJ do fornecedor ausente no item 3');
  });
});

describe('IntegracaoExternaSolicitada', () => {
  it('payload restrito a orcamentoId/acaoOrigem/ocorreuEm — nenhum campo de protocolo específico', () => {
    const evento = new IntegracaoExternaSolicitada(orcamentoId, 'SOLICITAR_REENVIO', tenantId);
    expect(Object.keys(evento).sort()).toEqual(
      ['acaoOrigem', 'detailType', 'ocorreuEm', 'orcamentoId', 'schemaVersion', 'tenantId'].sort(),
    );
    expect(evento.acaoOrigem).toBe('SOLICITAR_REENVIO');
  });
});

describe('DecisaoWorkflowEscalonadaParaComprador', () => {
  it('carrega o nivelConfianca insuficiente reportado pelo Orquestrador', () => {
    const evento = new DecisaoWorkflowEscalonadaParaComprador(orcamentoId, 40, tenantId);
    expect(evento.nivelConfianca).toBe(40);
  });
});
