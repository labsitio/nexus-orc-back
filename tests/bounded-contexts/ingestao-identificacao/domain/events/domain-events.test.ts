import { describe, expect, it } from 'vitest';
import type { DomainEventEnvelope } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/domain-event.js';
import { OrcamentoClassificado } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-classificado.event.js';
import { OrcamentoEscalonadoParaRevisaoHumana } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-escalonado-revisao-humana.event.js';
import { OrcamentoReclassificadoPorRevisaoHumana } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-reclassificado-revisao-humana.event.js';
import { OrcamentoRecebido } from '../../../../../src/bounded-contexts/ingestao-identificacao/domain/events/orcamento-recebido.event.js';

const orcamentoId = '018f4b1a-0000-7000-8000-000000000000';
const resultadoPayload = {
  fornecedorIdentificado: 'Fornecedor X',
  formatoIdentificado: 'PDF',
  nivelConfianca: 90,
  agenteOrigem: 'CLASSIFICADOR' as const,
};
const referenciaBrutaPayload = {
  bucket: 'nexo-orcamentos-raw',
  key: 'k',
  versionId: 'v1',
};
const tenantId = '018f4b1a-0000-7000-8000-000000000001';

describe.each([
  {
    nome: 'OrcamentoRecebido',
    detailType: 'OrcamentoRecebido',
    criar: () =>
      new OrcamentoRecebido(
        orcamentoId,
        'PORTAL_WEB',
        {
          bucket: 'nexo-orcamentos-raw',
          key: 'k',
          versionId: 'v1',
        },
        tenantId,
      ),
  },
  {
    nome: 'OrcamentoClassificado',
    detailType: 'OrcamentoClassificado',
    criar: () =>
      new OrcamentoClassificado(orcamentoId, resultadoPayload, referenciaBrutaPayload, tenantId),
  },
  {
    nome: 'OrcamentoEscalonadoParaRevisaoHumana',
    detailType: 'OrcamentoEscalonadoParaRevisaoHumana',
    criar: () => new OrcamentoEscalonadoParaRevisaoHumana(orcamentoId, resultadoPayload, tenantId),
  },
  {
    nome: 'OrcamentoReclassificadoPorRevisaoHumana',
    detailType: 'OrcamentoReclassificadoPorRevisaoHumana',
    criar: () =>
      new OrcamentoReclassificadoPorRevisaoHumana(
        orcamentoId,
        resultadoPayload,
        referenciaBrutaPayload,
        tenantId,
      ),
  },
])('$nome', ({ detailType, criar }) => {
  it(`schemaVersion 2, orcamentoId e detailType "${detailType}"`, () => {
    const evento = criar();
    expect(evento.schemaVersion).toBe(2);
    expect(evento.orcamentoId).toBe(orcamentoId);
    expect(evento.detailType).toBe(detailType);
    expect(() => new Date(evento.ocorreuEm)).not.toThrow();
    expect(new Date(evento.ocorreuEm).toISOString()).toBe(evento.ocorreuEm);
  });

  it(`payload sem "prioridade" continua válido (default implícito PADRAO) — ${detailType}`, () => {
    const evento: DomainEventEnvelope = criar();
    expect(evento.prioridade).toBeUndefined();
  });

  // (issue #744, escopo adicional) OrcamentoClassificado e
  // OrcamentoReclassificadoPorRevisaoHumana reaproveitam o mesmo shape —
  // ambos carregam referenciaBruta, sem a qual extrator-queue.handler.ts rejeita.
  if (
    detailType === 'OrcamentoClassificado' ||
    detailType === 'OrcamentoReclassificadoPorRevisaoHumana'
  ) {
    it(`carrega referenciaBruta idêntica ao ponteiro S3 — ${detailType}`, () => {
      const evento = criar() as unknown as { referenciaBruta: unknown };
      expect(evento.referenciaBruta).toEqual(referenciaBrutaPayload);
    });
  }
});
