import { describe, expect, it } from 'vitest';
import { CampoExtraido } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/campo-extraido.vo.js';
import { DescricaoProduto } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/descricao-produto.vo.js';
import { Dinheiro } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/dinheiro.vo.js';
import { ItemOrcamento } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/item-orcamento.vo.js';
import { NivelConfianca } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/nivel-confianca.vo.js';
import { Quantidade } from '../../../../../src/bounded-contexts/extracao/domain/value-objects/quantidade.vo.js';

const confiancaAlta = NivelConfianca.de(95);
const confiancaBaixa = NivelConfianca.de(20);

describe('ItemOrcamento.completo', () => {
  it('true quando todos os campos obrigatórios estão extraídos', () => {
    const item = ItemOrcamento.de({
      descricao: CampoExtraido.extraido(
        DescricaoProduto.de('Parafuso M6'),
        confiancaAlta,
        'EXTRATOR',
      ),
      quantidade: CampoExtraido.extraido(Quantidade.de(10), confiancaAlta, 'EXTRATOR'),
      precoUnitario: CampoExtraido.extraido(Dinheiro.de(1099, 'BRL'), confiancaAlta, 'EXTRATOR'),
    });
    expect(item.completo()).toBe(true);
  });

  it('false quando 1+ campo obrigatório não foi extraído com confiança suficiente', () => {
    const item = ItemOrcamento.de({
      descricao: CampoExtraido.extraido(
        DescricaoProduto.de('Parafuso M6'),
        confiancaAlta,
        'EXTRATOR',
      ),
      quantidade: CampoExtraido.extraido(Quantidade.de(10), confiancaAlta, 'EXTRATOR'),
      precoUnitario: CampoExtraido.naoExtraido(confiancaBaixa, 'EXTRATOR'),
    });
    expect(item.completo()).toBe(false);
  });
});
