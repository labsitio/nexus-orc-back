import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { emitirMetrica } from '../../../../../src/bounded-contexts/ingestao-identificacao/infrastructure/observability/metrica.js';

/** Logger pino real gravando em memória — permite inspecionar o JSON emitido (EMF é só log). */
function loggerDeTeste() {
  const linhas: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'info' },
    { write: (linha: string) => linhas.push(JSON.parse(linha) as Record<string, unknown>) },
  );
  return { logger, linhas };
}

describe('emitirMetrica', () => {
  it('emite uma linha de log EMF com namespace fixo do BC, unidade padrão Count e sem tenantId como dimensão', () => {
    const { logger, linhas } = loggerDeTeste();

    emitirMetrica(logger, 'TenantIdAusenteAoClassificar', 1);

    expect(linhas).toHaveLength(1);
    const linha = linhas[0] as Record<string, unknown>;
    expect(linha.TenantIdAusenteAoClassificar).toBe(1);
    const emf = linha._aws as { CloudWatchMetrics: Array<Record<string, unknown>> };
    expect(emf.CloudWatchMetrics[0]).toMatchObject({
      Namespace: 'Nexo/IngestaoIdentificacao',
      Dimensions: [[]],
      Metrics: [{ Name: 'TenantIdAusenteAoClassificar', Unit: 'Count' }],
    });
    expect(linha).not.toHaveProperty('tenantId');
  });

  it('aceita unidade e dimensões explícitas quando o chamador decide caso a caso', () => {
    const { logger, linhas } = loggerDeTeste();

    emitirMetrica(logger, 'TempoAteIndexacao', 250, {
      unidade: 'Milliseconds',
      dimensoes: { canal: 'SFTP' },
    });

    const linha = linhas[0] as Record<string, unknown>;
    expect(linha.TempoAteIndexacao).toBe(250);
    expect(linha.canal).toBe('SFTP');
    const emf = linha._aws as { CloudWatchMetrics: Array<Record<string, unknown>> };
    expect(emf.CloudWatchMetrics[0]).toMatchObject({
      Dimensions: [['canal']],
      Metrics: [{ Name: 'TempoAteIndexacao', Unit: 'Milliseconds' }],
    });
  });
});
