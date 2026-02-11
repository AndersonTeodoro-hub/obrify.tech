export function generateAgentResponse(query: string): string {
  const q = query.toLowerCase();

  if (q.includes("cota") || q.includes("cotas") || q.includes("nível") || q.includes("nivel")) {
    return `Realizei a verificação de cotas cruzando todos os projetos. Encontrei **3 divergências significativas**:\n\n**1. Bloco B5** — Cota de arrasamento -0.95m (estrutural) vs. plataforma -0.80m (terraplanagem). Δ=0.15m. Conforme NP EN 1992-1-1, o recobrimento nominal mínimo para XC2 é 35mm — com o bloco exposto, fica comprometido.\n\n**2. Viga VE-01** — Topo a -0.40m vs. aterro a -0.25m. Viga 0.15m acima do terrapleno, exposta sem proteção (NP EN 206).\n\n**3. Bloco B8** — Fundo estacas -8.50m com NA a -7.00m. Execução abaixo do NA requer medidas especiais (EN 1536, lamas bentoníticas ou tubo-molde).\n\nRecomendo prioritizar B5. Devo elaborar o relatório?`;
  }
  if (q.includes("colisão") || q.includes("colisões") || q.includes("colisoes") || q.includes("rede") || q.includes("interferência")) {
    return `Identifiquei **4 colisões diretas** e **3 proximidades perigosas**:\n\n**Colisões:**\n1. DN150 hidráulica × Bloco B2 (Eixo 3)\n2. DN200 esgoto × Sapata SC-02 (Eixo 1-2)\n3. Eletroduto MT × Estaca EHC-12 (Eixo 8)\n4. CV-03 × Bloco B6 (Eixo 7)\n\n**Proximidades Perigosas:**\n1. VB-04 × gás — 0.05m (mín. 0.30m, Portaria 361/98)\n2. Estacas B10 × DN200 — 0.20m (mín. 0.50m)\n3. DN100 pluviais × P9 — sem negativo na laje\n\nPosso detalhar as soluções para cada uma?`;
  }
  if (q.includes("relatório") || q.includes("relatorio") || q.includes("report")) {
    return `Vou preparar o relatório técnico profissional:\n\n**1. Identificação da Obra** — Dados, localização, intervenientes\n**2. Resumo Executivo** — 4 críticas, 7 alertas, 3 observações\n**3. Quadro de Incompatibilidades** — Tabela com referência e severidade\n**4. Fichas de Incompatibilidade** — Detalhe com cortes e referência normativa\n**5. Recomendações Técnicas** — Soluções com estimativa de impacto\n**6. Matriz de Prioridades** — Por risco, custo e prazo\n\nRelatório em **Português de Portugal** com terminologia conforme Eurocódigos e Anexos Nacionais. Deseja PDF para partilha?`;
  }
  if (q.includes("terra") || q.includes("terraplanagem") || q.includes("aterro") || q.includes("escavação")) {
    return `Análise terraplanagem × fundações — **4 incompatibilidades**:\n\n**Críticas:**\n1. **Cota plataforma × B5:** Δ=0.15m, bloco exposto. Recobrimento comprometido (NP EN 1992-1-1, Quadro NA.4.4N). Ajustar cota terraplanagem para -1.00m ou rebaixar arrasamento.\n2. **Rampa × MS-01:** Escavação 0.30m abaixo da fundação do muro. Risco de descalçamento (EN 1997-1, Secção 9).\n\n**Alertas:**\n3. **Aterro × VE-01:** Viga acima do terrapleno. Mínimo 0.10m enterrada.\n4. **Sondagens Eixos 11-14:** Campanha de 2023, LNEC recomenda atualizar (>2 anos).\n\nSugiro reunião de coordenação para alinhar datum altimétrico.`;
  }
  if (q.includes("norma") || q.includes("eurocódigo") || q.includes("eurocodigo") || q.includes("regulament") || q.includes("legislação")) {
    return `Normas aplicáveis em Portugal:\n\n**Estruturas e Fundações:**\n• NP EN 1992-1-1 (Eurocódigo 2) — Betão armado\n• EN 1997-1 (Eurocódigo 7) — Projeto geotécnico\n• NP EN 206 — Especificação do betão\n• EN 1536 — Estacas moldadas\n\n**Redes Enterradas:**\n• DR 23/95 — Distribuição água e drenagem\n• Portaria 361/98 — Instalações de gás\n• RTIEBT — Instalações elétricas\n• EN 1401 — Tubagens PVC\n• EN 12201 — Tubagens PEAD\n\n**LNEC:**\n• Especificações E-SPT, ensaios de carga\n• Documentos de Homologação\n\nPosso detalhar qualquer norma específica.`;
  }
  if (q.includes("material") || q.includes("betão") || q.includes("concreto") || q.includes("aço") || q.includes("tubagem")) {
    return `Materiais referenciados nos projetos:\n\n**Betão (NP EN 206):**\n• Fundações: C30/37 — classe XC2. Recobrimento: 35mm + Δcdev (10mm).\n• Lajes: C25/30 — verificar XA1 junto às redes de drenagem.\n\n**Aço (NP EN 1992-1-1, Anexo Nacional):**\n• A500NR SD — armaduras ordinárias (padrão PT)\n• B500A — redes eletrossoldadas\n\n**Tubagens:**\n• PVC-U EN 1401 (SN4/SN8) — drenagem\n• PEAD EN 12201 PE100 SDR11 — abastecimento\n• FFD EN 545 — sob pressão em zonas de carga\n\n**Atenção Eixo 3:** PEAD DN150 PN16 junto ao betão — recomendo manga de proteção (EN 12201-1).`;
  }
  if (q.includes("partilh") || q.includes("compartilh") || q.includes("email") || q.includes("enviar")) {
    return `Para partilhar o relatório:\n\n📧 **Email** — PDF profissional com logótipo, carimbo técnico e índice.\n📱 **WhatsApp** — PDF com resumo na mensagem.\n\n**Formato:** Português de Portugal, terminologia normalizada, referências Eurocódigos e regulamentação PT.\n\nUse o botão "Partilhar Relatório" no topo da página para enviar. Quer que prepare o relatório agora?`;
  }
  return `Entendido. Vou analisar cruzando os projetos carregados.\n\nPosso verificar:\n• **Interferências geométricas** — colisões entre disciplinas\n• **Divergências de cotas** — desníveis não coordenados\n• **Distâncias regulamentares** — Eurocódigos e regulamentação PT\n• **Condicionantes de execução** — sequência construtiva\n\nEspecifique o eixo ou elemento, ou posso executar análise completa. Use também os comandos rápidos abaixo.`;
}

export function renderMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, "<br/>");
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}
