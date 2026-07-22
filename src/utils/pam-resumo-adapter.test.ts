import { describe, it, expect } from 'vitest';
import { buildOfficialPamData } from './pam-resumo-adapter';

describe('Resumo PAM — Secção 1 sem fase/revisão (decisão temporária)', () => {
  it('funde tudo num grupo de título vazio e não imprime fase/revisão', () => {
    const out = buildOfficialPamData({
      pam_reference: 'PAM 009',
      header_sintese: { veredito: 'APROVADO CONDICIONADO', base_analise: 'x', material: 'y' },
      mqt_articles_by_phase: [
        { fase: 'Fase 1.1', revisao: 'Rev.02, Dez 2025', article: '1.3.3.1', description: 'd', diameter: '125', quantity: '10', norm: 'EN 1917' },
        { fase: 'Fase 1.2', revisao: 'Rev.01', article: '1.4.2', description: 'd', diameter: '160', quantity: '20', norm: 'EN 1917' },
      ],
      cte_sections: [{ section: 's', requirement: 'r', verification: 'v', verdict: 'CONFORME' }],
    }, 'Obra X');

    expect(out.seccao1.grupos).toHaveLength(1);
    expect(out.seccao1.grupos[0].titulo).toBe('');
    expect(out.seccao1.grupos[0].artigos).toHaveLength(2);
    expect(JSON.stringify(out.seccao1)).not.toMatch(/Fase|Rev\./);
  });
});
