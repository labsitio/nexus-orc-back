// ADR-004 (spec 001/007): nenhum código é compartilhado por import direto entre
// Bounded Contexts (src/bounded-contexts/<bc>/). Comunicação cross-context é via
// Domain Event ou Anti-Corruption Layer explícita. Única exceção autorizada:
// src/shared-kernel/tenant/ — que não vive sob bounded-contexts/, então nunca cai
// nesta regra.
//
// Resolve o import (relativo ou literal) para descobrir o BC de destino, em vez de
// apenas comparar strings — um `no-restricted-imports` simples não pega
// `import x from '../../outro-bc/domain/x'` porque o texto do import não contém o
// segmento "bounded-contexts".
import path from 'node:path';

function extractBc(filePath) {
  const segments = filePath.split(/[\\/]/);
  const idx = segments.indexOf('bounded-contexts');
  if (idx === -1 || idx + 1 >= segments.length) return null;
  return segments[idx + 1];
}

function checkSource(context, filename, fromBc, node, source) {
  if (typeof source !== 'string') return;
  // Specifiers não-relativos (sem ".") são checados pelo texto literal, sem
  // resolução de tsconfig `paths` — hoje seguro porque o projeto não tem path
  // aliases configurados. Se `paths` for adicionado no futuro apontando para
  // dentro de bounded-contexts/ sem o literal "bounded-contexts" no specifier,
  // revisitar esta regra para resolver via ts-config-paths antes de comparar.
  const target = source.startsWith('.') ? path.resolve(path.dirname(filename), source) : source;
  const toBc = extractBc(target);
  if (toBc && toBc !== fromBc) {
    context.report({ node, messageId: 'crossBcImport', data: { fromBc, toBc } });
  }
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Proíbe import direto entre Bounded Contexts (ADR-004). Única exceção autorizada: src/shared-kernel/tenant/.',
    },
    schema: [],
    messages: {
      crossBcImport:
        'Import direto entre Bounded Contexts não é permitido (ADR-004): "{{fromBc}}" importando de "{{toBc}}". Use Domain Event ou uma Anti-Corruption Layer explícita. Única exceção autorizada: src/shared-kernel/tenant/.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const fromBc = extractBc(filename);
    if (!fromBc) return {};

    return {
      ImportDeclaration(node) {
        checkSource(context, filename, fromBc, node.source, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkSource(context, filename, fromBc, node.source, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (node.source) checkSource(context, filename, fromBc, node.source, node.source.value);
      },
      ImportExpression(node) {
        if (node.source?.type === 'Literal') {
          checkSource(context, filename, fromBc, node.source, node.source.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments[0]?.type === 'Literal'
        ) {
          checkSource(context, filename, fromBc, node.arguments[0], node.arguments[0].value);
        }
      },
    };
  },
};
