import type { Finding, ProjectType } from './types';

export function formatFileSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function renderMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

// ---- PDF text analysis ----

interface ExtractedData {
  cotas: string[];
  elements: string[];
  diameters: string[];
  axes: string[];
  rawText: string;
}

export function analyzeText(text: string): ExtractedData {
  const cotaRegex = /-?\d+[.,]\d+\s*m\b/g;
  const elementRegex = /\b[PB]\d+|VB-?\d+|SC-?\d+|EHC-?\d+|VE-?\d+|MS-?\d+/g;
  const diameterRegex = /DN\s*\d+|[ØO]\s*\d+/g;
  const axisRegex = /[Ee]ixo\s*\d+/g;

  return {
    cotas: [...new Set((text.match(cotaRegex) || []))],
    elements: [...new Set((text.match(elementRegex) || []))],
    diameters: [...new Set((text.match(diameterRegex) || []))],
    axes: [...new Set((text.match(axisRegex) || []))],
    rawText: text,
  };
}

export function crossAnalyze(
  projectsData: Array<{ type: ProjectType; name: string; format: string; data: ExtractedData | null }>
): Omit<Finding, 'id' | 'analysis_id' | 'created_at'>[] {
  const findings: Omit<Finding, 'id' | 'analysis_id' | 'created_at'>[] = [];

  const byType: Record<string, typeof projectsData> = {};
  for (const p of projectsData) {
    if (!byType[p.type]) byType[p.type] = [];
    byType[p.type].push(p);
  }

  const types = Object.keys(byType);

  // Cross-compare elements between different disciplines
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const typeA = types[i];
      const typeB = types[j];
      const projectsA = byType[typeA].filter(p => p.data);
      const projectsB = byType[typeB].filter(p => p.data);

      // Find shared elements with different cotas
      for (const pA of projectsA) {
        for (const pB of projectsB) {
          if (!pA.data || !pB.data) continue;

          const sharedElements = pA.data.elements.filter(e => pB.data!.elements.includes(e));
          for (const elem of sharedElements) {
            // Check if cotas differ around this element
            const cotasA = pA.data.cotas;
            const cotasB = pB.data.cotas;
            if (cotasA.length > 0 && cotasB.length > 0) {
              const uniqueCotasA = cotasA.filter(c => !cotasB.includes(c));
              if (uniqueCotasA.length > 0) {
                findings.push({
                  severity: 'critical',
                  title: `Divergência de cotas no elemento ${elem}`,
                  description: `O elemento ${elem} aparece no projeto "${pA.name}" (${typeA}) com cotas [${uniqueCotasA.slice(0, 3).join(', ')}] e no projeto "${pB.name}" (${typeB}) com cotas diferentes. Verificar compatibilidade conforme NP EN 1992-1-1.`,
                  location: elem,
                  tags: [typeA, typeB],
                  resolved: false,
                });
              }
            }
          }

          // Check pipe-structure interference
          if (
            (typeA === 'rede_enterrada' && ['fundacoes', 'estrutural'].includes(typeB)) ||
            (typeB === 'rede_enterrada' && ['fundacoes', 'estrutural'].includes(typeA))
          ) {
            const pipeProject = typeA === 'rede_enterrada' ? pA : pB;
            const structProject = typeA === 'rede_enterrada' ? pB : pA;
            if (pipeProject.data && structProject.data) {
              const sharedAxes = pipeProject.data.axes.filter(a => structProject.data!.axes.includes(a));
              for (const axis of sharedAxes.slice(0, 3)) {
                if (pipeProject.data.diameters.length > 0 && structProject.data.elements.length > 0) {
                  findings.push({
                    severity: 'warning',
                    title: `Possível interferência rede × estrutura no ${axis}`,
                    description: `Tubulação ${pipeProject.data.diameters[0]} no ${axis} pode interferir com ${structProject.data.elements[0]} do projeto "${structProject.name}". Verificar distâncias mínimas conforme DR 23/95 e Portaria 361/98.`,
                    location: axis,
                    tags: [typeA, typeB],
                    resolved: false,
                  });
                }
              }
            }
          }

          // Terraplanagem vs fundacoes cota check
          if (
            (typeA === 'terraplanagem' && typeB === 'fundacoes') ||
            (typeA === 'fundacoes' && typeB === 'terraplanagem')
          ) {
            const terraProject = typeA === 'terraplanagem' ? pA : pB;
            const fundProject = typeA === 'terraplanagem' ? pB : pA;
            if (terraProject.data && fundProject.data && terraProject.data.cotas.length > 0 && fundProject.data.cotas.length > 0) {
              findings.push({
                severity: 'critical',
                title: 'Verificar compatibilidade de cotas terraplanagem × fundações',
                description: `Cotas de terraplanagem [${terraProject.data.cotas.slice(0, 2).join(', ')}] podem ser incompatíveis com cotas de fundações [${fundProject.data.cotas.slice(0, 2).join(', ')}]. Verificar que o arrasamento dos blocos fica abaixo da plataforma acabada. Ref: NP EN 1992-1-1, NP EN 206.`,
                location: 'Geral',
                tags: ['terraplanagem', 'fundacoes'],
                resolved: false,
              });
            }
          }
        }
      }
    }
  }

  // Add DWG/DWF/IFC info findings
  for (const p of projectsData) {
    if (['dwg', 'dwf', 'ifc'].includes(p.format)) {
      findings.push({
        severity: 'info',
        title: `Ficheiro ${p.name} (${p.format.toUpperCase()}) — análise visual recomendada`,
        description: `O ficheiro "${p.name}" no formato ${p.format.toUpperCase()} foi carregado mas a análise automática de texto não está disponível para este formato. Recomenda-se verificação visual das interferências com os restantes projetos.`,
        location: '',
        tags: [p.type],
        resolved: false,
      });
    }
  }

  // If no real findings from PDFs, add discipline-based warnings
  const realFindings = findings.filter(f => f.severity !== 'info');
  if (realFindings.length === 0 && types.length >= 2) {
    if (types.includes('fundacoes') && types.includes('rede_enterrada')) {
      findings.push({
        severity: 'warning',
        title: 'Verificar interferências fundações × redes enterradas',
        description: 'Projetos de fundações e redes enterradas foram carregados. Verificar interferências entre elementos de fundação e traçado das redes. Ref: DR 23/95, Portaria 361/98.',
        location: 'Geral',
        tags: ['fundacoes', 'rede_enterrada'],
        resolved: false,
      });
    }
    if (types.includes('fundacoes') && types.includes('terraplanagem')) {
      findings.push({
        severity: 'warning',
        title: 'Verificar compatibilidade cotas terraplanagem × fundações',
        description: 'Verificar compatibilidade de cotas entre plataforma de terraplanagem e arrasamento das fundações. Ref: NP EN 1992-1-1.',
        location: 'Geral',
        tags: ['fundacoes', 'terraplanagem'],
        resolved: false,
      });
    }
    if (types.includes('estrutural') && types.includes('rede_enterrada')) {
      findings.push({
        severity: 'warning',
        title: 'Verificar passagens de tubagem em elementos estruturais',
        description: 'Verificar passagens de tubagem através de elementos estruturais (lajes, vigas). Ref: NP EN 1992-1-1, Secção 8.',
        location: 'Geral',
        tags: ['estrutural', 'rede_enterrada'],
        resolved: false,
      });
    }
    findings.push({
      severity: 'info',
      title: 'Análise cruzada concluída',
      description: 'Análise cruzada entre as disciplinas carregadas foi concluída. Recomenda-se verificação visual complementar dos projetos.',
      location: 'Geral',
      tags: types,
      resolved: false,
    });
  }

  return findings;
}

export function generateAgentResponseFromFindings(
  query: string,
  findings: Finding[]
): string {
  const q = query.toLowerCase();
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const infoCount = findings.filter(f => f.severity === 'info').length;

  if (q.includes('cota') || q.includes('cotas') || q.includes('nível') || q.includes('nivel')) {
    const cotaFindings = findings.filter(f => f.title.toLowerCase().includes('cota') || f.description.toLowerCase().includes('cota'));
    if (cotaFindings.length > 0) {
      let response = `Encontrei **${cotaFindings.length} divergência(s) de cotas** na análise:\n\n`;
      cotaFindings.forEach((f, i) => {
        response += `**${i + 1}. ${f.title}**\n${f.description}\n\n`;
      });
      response += `Recomendo verificar prioritariamente as incompatibilidades críticas. Conforme NP EN 1992-1-1 e NP EN 206.`;
      return response;
    }
    return 'Não foram encontradas divergências de cotas na última análise. Carregue mais projetos ou execute nova análise para verificação completa.';
  }

  if (q.includes('colisão') || q.includes('colisões') || q.includes('colisoes') || q.includes('rede') || q.includes('interferência')) {
    const redeFindings = findings.filter(f =>
      f.tags.includes('rede_enterrada') || f.title.toLowerCase().includes('rede') || f.title.toLowerCase().includes('interferência') || f.title.toLowerCase().includes('tubulação')
    );
    if (redeFindings.length > 0) {
      let response = `Identifiquei **${redeFindings.length} interferência(s)** envolvendo redes:\n\n`;
      redeFindings.forEach((f, i) => {
        response += `**${i + 1}. ${f.title}** (${f.severity === 'critical' ? '🔴 Crítica' : f.severity === 'warning' ? '🟡 Alerta' : '🟢 Info'})\n${f.description}\n\n`;
      });
      return response;
    }
    return 'Não foram encontradas interferências com redes na última análise. Verifique se carregou os projetos de redes enterradas.';
  }

  if (q.includes('relatório') || q.includes('relatorio') || q.includes('report')) {
    return `Posso gerar o relatório técnico profissional com:\n\n**1. Identificação da Obra** — Dados, localização, intervenientes\n**2. Resumo Executivo** — ${criticalCount} críticas, ${warningCount} alertas, ${infoCount} observações\n**3. Quadro de Incompatibilidades** — Tabela com referência e severidade\n**4. Recomendações Técnicas** — Soluções com referência normativa\n\nUse o botão **"Partilhar Relatório"** no topo da página para gerar e descarregar o PDF.`;
  }

  if (q.includes('norma') || q.includes('eurocódigo') || q.includes('eurocodigo') || q.includes('regulament') || q.includes('legislação')) {
    return `Normas aplicáveis em Portugal:\n\n**Estruturas e Fundações:**\n• NP EN 1992-1-1 (Eurocódigo 2) — Betão armado\n• EN 1997-1 (Eurocódigo 7) — Projeto geotécnico\n• NP EN 206 — Especificação do betão\n• EN 1536 — Estacas moldadas\n\n**Redes Enterradas:**\n• DR 23/95 — Distribuição água e drenagem\n• Portaria 361/98 — Instalações de gás\n• RTIEBT — Instalações elétricas\n• EN 1401 — Tubagens PVC\n• EN 12201 — Tubagens PEAD`;
  }

  if (q.includes('material') || q.includes('betão') || q.includes('concreto') || q.includes('aço') || q.includes('tubagem')) {
    return `Materiais referenciados:\n\n**Betão (NP EN 206):**\n• Fundações: C30/37 — classe XC2. Recobrimento: 35mm + Δcdev.\n• Lajes: C25/30\n\n**Aço:**\n• A500NR SD — armaduras ordinárias\n• B500A — redes eletrossoldadas\n\n**Tubagens:**\n• PVC-U EN 1401 (SN4/SN8) — drenagem\n• PEAD EN 12201 PE100 SDR11 — abastecimento\n• FFD EN 545 — sob pressão`;
  }

  if (findings.length > 0) {
    return `Analisei a obra e encontrei **${findings.length} incompatibilidades** no total:\n• **${criticalCount}** críticas\n• **${warningCount}** alertas\n• **${infoCount}** observações\n\nPosso detalhar qualquer incompatibilidade. Pergunte sobre cotas, colisões de redes, normas ou materiais. Use também os comandos rápidos abaixo.`;
  }

  return `Entendido. Posso ajudar com:\n• **Verificação de cotas** — divergências entre projetos\n• **Interferências de redes** — colisões com elementos estruturais\n• **Normas PT** — Eurocódigos e regulamentação portuguesa\n• **Materiais** — betão, aço, tubagens\n\nCarregue projetos e execute a análise para obter resultados reais.`;
}
