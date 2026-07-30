import { describe, expect, it } from 'vitest';
import { CampoExtraido } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { CondicoesComerciais } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/condicoes-comerciais.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';
import { PeriodoValidade } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/periodo-validade.vo.js';

const confiancaAlta = NivelConfianca.de(95);
const confiancaBaixa = NivelConfianca.de(20);

function condicoesCompletas(): CondicoesComerciais {
  return CondicoesComerciais.de({
    condicoesPagamento: CampoExtraido.extraido('30 dias', confiancaAlta, 'EXTRATOR'),
    prazoValidade: CampoExtraido.extraido(
      PeriodoValidade.de(new Date('2026-12-31')),
      confiancaAlta,
      'EXTRATOR',
    ),
    condicoesEntrega: CampoExtraido.extraido('FOB', confiancaAlta, 'EXTRATOR'),
  });
}

describe('CondicoesComerciais.completo', () => {
  it('true quando todos os campos obrigatórios estão extraídos', () => {
    expect(condicoesCompletas().completo()).toBe(true);
  });

  it('false quando 1+ campo obrigatório não foi extraído com confiança suficiente', () => {
    const condicoes = CondicoesComerciais.de({
      condicoesPagamento: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
      prazoValidade: CampoExtraido.extraido(
        PeriodoValidade.de(new Date('2026-12-31')),
        confiancaAlta,
        'EXTRATOR',
      ),
      condicoesEntrega: CampoExtraido.extraido('FOB', confiancaAlta, 'EXTRATOR'),
    });
    expect(condicoes.completo()).toBe(false);
  });
});
