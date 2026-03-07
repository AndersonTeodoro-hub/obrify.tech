

# Reescrever `generateMaterialApprovalPDF` com layout profissional

## Problemas actuais
- Margens inconsistentes (20mm em vez de 25mm), badge calculado com fórmula errada (`getTextWidth * 0.6`)
- Texto não usa `splitTextToSize` em várias secções (issues, conditions, requirements, reviewer_notes)
- Cabeçalho só na primeira página, sem linha separadora
- Secções de issues/conditions calculam altura fixa sem considerar word-wrap — overflow garantido com textos longos

## Alterações — ficheiro único: `src/utils/material-approval-pdf.ts`

### Constantes e helpers
- Margens: left=25, right=25, top=20, bottom=20, contentWidth=160
- `addHeader(doc, y, obraName, date)` — cabeçalho repetido em cada página com linha separadora
- `checkSpace(needed)` — se não cabe, `addPage()` + `addHeader()`
- `addWrappedText(text, x, maxWidth)` — usa `splitTextToSize` sempre, retorna altura consumida
- `addSectionTitle(title)` — bold 14pt com espaçamento

### Cabeçalho (cada página)
- Esquerda: "Análise PAM" bold 18pt
- Direita: "OBRIFY — Fiscalização Inteligente" 12pt
- Linha 2: nome da obra + data geração
- Linha horizontal separadora

### Badge de estado
- Calcular largura real com `getTextWidth` (sem multiplicador errado)
- Padding de 5mm cada lado
- Cores: verde `#27AE60`, laranja `#E67E22`, vermelho `#E74C3C`, cinza para pendente
- `roundedRect` com raio 3mm

### Secções com word-wrap obrigatório
- **Material Proposto**: cada campo com `splitTextToSize(text, contentWidth - 8)`
- **Especificação do Projecto**: description + requirements com wrap
- **Problemas Identificados**: calcular altura real das linhas wrapped ANTES de desenhar o rectângulo rosa (`#FDE8E8`)
- **Condições de Aprovação**: idem, fundo amarelo (`#FEF9E7`)
- **Justificação**: wrap completo
- **Normas Referenciadas**: wrap
- **Observações do Fiscal**: nova secção — lê `fiscal_notes` do ApprovalData, lista cada nota com timestamp
- **Decisão Final / Reviewer Notes**: wrap no texto de notas

### Tabela de conformidade
- `autoTable` com `margin: { left: 25, right: 25 }` — colunas proporcionais dentro de 160mm
- Header cinza `#F5F5F5`, borders `#CCCCCC`

### Quebra de página
- `checkSpace` antes de cada secção; ao criar nova página, chamar `addHeader`

### Rodapé (cada página)
- Esquerda: "OBRIFY — Fiscalização Inteligente de Obras" 8pt
- Direita: "Página X de Y" 8pt
- Posição Y = 287mm (dentro da margem inferior)

### Interface `ApprovalData`
- Adicionar `fiscal_notes?: Array<{ note: string; created_at: string }> | null` para incluir observações no PDF

