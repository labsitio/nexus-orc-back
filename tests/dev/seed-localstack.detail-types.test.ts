import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * (issue #744) Asserção mínima por leitura textual, não por import: o módulo
 * `src/dev/seed-localstack.ts` roda `main()` no top-level ao ser importado
 * (efeito colateral contra AWS/LocalStack), então a prova aqui é textual —
 * garante que as regras de `extrator-queue` e `contexto-classificacao-queue`
 * declaram os dois `detailType` (`OrcamentoClassificado` e
 * `OrcamentoReclassificadoPorRevisaoHumana`), o mesmo par que as stacks CDK
 * de produção (`extrator-queue-stack.test.ts`,
 * `contexto-classificacao-queue-stack.test.ts`) já provam via síntese.
 */
describe('seed-localstack — detailTypes de extrator-queue/contexto-classificacao-queue', () => {
  const caminho = fileURLToPath(new URL('../../src/dev/seed-localstack.ts', import.meta.url));
  const conteudo = readFileSync(caminho, 'utf-8');

  it('declara detailTypes com o par OrcamentoClassificado + OrcamentoReclassificadoPorRevisaoHumana para extrator-queue', () => {
    const trecho = conteudo.slice(
      conteudo.indexOf("nome: 'extrator-queue'"),
      conteudo.indexOf('},', conteudo.indexOf("nome: 'extrator-queue'")),
    );
    expect(trecho).toContain(
      "detailTypes: ['OrcamentoClassificado', 'OrcamentoReclassificadoPorRevisaoHumana']",
    );
  });

  it('declara detailTypes com o par OrcamentoClassificado + OrcamentoReclassificadoPorRevisaoHumana para contexto-classificacao-queue', () => {
    const trecho = conteudo.slice(
      conteudo.indexOf("nome: 'contexto-classificacao-queue'"),
      conteudo.indexOf('},', conteudo.indexOf("nome: 'contexto-classificacao-queue'")),
    );
    expect(trecho).toContain(
      "detailTypes: ['OrcamentoClassificado', 'OrcamentoReclassificadoPorRevisaoHumana']",
    );
  });
});
