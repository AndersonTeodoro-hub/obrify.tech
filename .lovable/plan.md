
# Plano: Implementacao Completa do Relatorio de Inspecao em PDF

## Resumo
Refactorizar a funcao `generateInspectionReport` no servico `pdfGenerator.ts` para implementar a estrutura completa do relatorio de inspecao, e adicionar botao "Gerar PDF" na pagina `InspectionDetail.tsx` quando o estado for "Concluida".

---

## Analise do Estado Actual

### Servico Existente (pdfGenerator.ts):
- Ja existe a funcao `generateInspectionReport` com estrutura basica
- Tem cabecalho, dados gerais, resumo e tabela simples de checklist
- Fotos limitadas a 8, sem legendas numeradas
- Falta: objectivo baseado no template, NCs abertas, conclusao, assinatura

### Pagina InspectionDetail.tsx:
- Nao tem botao para gerar PDF
- Mostra alerta de "read-only" quando estado = COMPLETED
- Tem acesso ao inspectionId necessario

### Dados Disponiveis:
- **inspections**: id, status, scheduled_at, created_by, site_id, template_id, floor_id, area_id
- **sites**: id, name, address
- **inspection_templates**: id, name, category
- **inspection_items**: id, result, notes, template_item_id
- **inspection_template_items**: id, title, section, is_required
- **evidence_links**: id, capture_id, inspection_id, inspection_item_id
- **captures**: id, file_path
- **nonconformities**: abertas nesta inspecao
- **profiles**: full_name do inspector

---

## Estrutura Final do PDF

```text
┌─────────────────────────────────────────────────────────────────┐
│  [LOGO]              RELATORIO DE INSPECAO              Pag X/Y│
│                                                                  │
│  Referencia: INS-2026-001                 Data: 05/02/2026      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DADOS GERAIS                                                    │
│  Obra: Edificio Aurora                                          │
│  Morada: Rua das Flores, 123, Lisboa                            │
│  Local: Piso 1 > Sala A > P01                                   │
│  Inspector: Joao Silva                                          │
│  Data da Inspecao: 05 de Fevereiro de 2026                      │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OBJECTIVO                                                       │
│  Esta inspecao teve como objectivo a verificacao das            │
│  condicoes de [categoria do template] conforme o checklist      │
│  "[nome do template]".                                          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TABELA DE VERIFICACOES                                          │
│  ┌────┬────────────────────────┬──────────┬───────────────────┐ │
│  │ #  │ Item                   │ Conforme │ Observacoes       │ │
│  ├────┼────────────────────────┼──────────┼───────────────────┤ │
│  │ 1  │ Cofragem limpa         │ Sim      │ -                 │ │
│  │ 2  │ Armadura conforme      │ Nao      │ Falta recobrimen..│ │
│  │ 3  │ Escoramento estavel    │ Sim      │ -                 │ │
│  │ 4  │ Verificacao betoneira  │ N/A      │ Nao aplicavel     │ │
│  └────┴────────────────────────┴──────────┴───────────────────┘ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  REGISTO FOTOGRAFICO                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                         │
│  │  Foto 1  │ │  Foto 2  │ │  Foto 3  │                         │
│  │          │ │          │ │          │                         │
│  └──────────┘ └──────────┘ └──────────┘                         │
│   Item #2      Geral         Item #5                            │
│                                                                  │
│  (max 6 fotos por pagina, com legenda numerada)                 │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  NAO-CONFORMIDADES ABERTAS                                       │
│  ┌────┬─────────────────────────┬───────────┬─────────────────┐ │
│  │ NC │ Descricao               │ Severid.  │ Estado          │ │
│  ├────┼─────────────────────────┼───────────┼─────────────────┤ │
│  │ 001│ Fissura na laje...      │ Critico   │ Aberta          │ │
│  │ 002│ Armadura exposta...     │ Importante│ Em Resolucao    │ │
│  └────┴─────────────────────────┴───────────┴─────────────────┘ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CONCLUSAO                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │    ☑ APROVADO     ☐ CONDICIONADO     ☐ REPROVADO           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  (Logica: Aprovado se 0 NCs, Condicionado se NCs severity !=   │
│   critical, Reprovado se alguma NC critical)                    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ASSINATURA                                                      │
│                                                                  │
│  Inspector: Joao Silva                                          │
│  Data: 05/02/2026                                               │
│                                                                  │
│  _________________________                                       │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Pagina 1 de 2                    Gerado em 05/02/2026 15:30   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Ficheiros a Modificar

| Ficheiro | Accao |
|----------|-------|
| src/services/pdfGenerator.ts | Refactorizar generateInspectionReport |
| src/pages/app/InspectionDetail.tsx | Adicionar botao "Gerar PDF" |
| src/i18n/locales/pt.json | Adicionar novas chaves de traducao |
| src/i18n/locales/en.json | Adicionar novas chaves de traducao |

---

## Alteracoes no pdfGenerator.ts

### Novos Dados a Buscar:
1. **nonconformities**: NCs criadas nesta inspecao
2. Contador sequencial baseado na data de criacao

### Nova Estrutura da Funcao:

```text
generateInspectionReport(inspectionId):
  1. Fetch todos os dados necessarios
  2. Cabecalho (Logo | Titulo | Ref + Data)
  3. Dados Gerais (Obra, Morada, Local, Inspector, Data)
  4. Objectivo (texto dinamico baseado no template)
  5. Tabela de Verificacoes (# | Item | Conforme | Observacoes)
  6. Registo Fotografico (max 6 por pagina, com legendas)
  7. NCs Abertas (se existirem)
  8. Conclusao (Aprovado/Condicionado/Reprovado)
  9. Assinatura (Nome do inspector + data + linha)
  10. Footer em todas as paginas
```

### Logica de Conclusao:
```text
if (ncs com severity='critical') -> REPROVADO
else if (ncs.length > 0) -> CONDICIONADO  
else -> APROVADO
```

### Legendas das Fotos:
- Fotos gerais: "Geral"
- Fotos de itens: "Item #N" (numero do item no checklist)

---

## Alteracoes no InspectionDetail.tsx

### Novo Botao no Header:
Quando `inspection.status === 'COMPLETED'`:

```text
<Button 
  variant="outline" 
  onClick={handleGeneratePDF}
  disabled={isGeneratingPDF}
>
  <FileText className="w-4 h-4 mr-2" />
  {isGeneratingPDF ? t('reports.generating') : t('reports.downloadPdf')}
</Button>
```

### Posicionamento:
No header, junto aos badges de status (linha 431-438 do ficheiro actual).

### Handler:
```text
const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

const handleGeneratePDF = async () => {
  setIsGeneratingPDF(true);
  try {
    const blob = await generateInspectionReport(inspectionId!);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-inspecao-${inspectionId?.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t('reports.downloadSuccess') });
  } catch (error) {
    toast({ 
      title: t('common.error'), 
      description: String(error), 
      variant: 'destructive' 
    });
  } finally {
    setIsGeneratingPDF(false);
  }
};
```

---

## Novas Traducoes

### Portugues (pt.json):
```text
reports.objective: "Objectivo"
reports.objectiveText: "Esta inspecao teve como objectivo a verificacao das condicoes de {{category}} conforme o checklist \"{{template}}\"."
reports.verificationsTable: "Tabela de Verificacoes"
reports.photoRegistry: "Registo Fotografico"
reports.openNCs: "Nao-Conformidades Abertas"
reports.conclusion: "Conclusao"
reports.conclusionApproved: "Aprovado"
reports.conclusionConditional: "Condicionado"
reports.conclusionRejected: "Reprovado"
reports.signature: "Assinatura"
reports.inspector: "Inspector"
reports.inspectionDate: "Data da Inspecao"
reports.reference: "Referencia"
reports.generalPhoto: "Geral"
reports.itemPhoto: "Item #{{number}}"
reports.downloadSuccess: "Relatorio gerado com sucesso"
reports.generalData: "Dados Gerais"
reports.conformYes: "Sim"
reports.conformNo: "Nao"
reports.conformNA: "N/A"
reports.conformOBS: "OBS"
```

### Ingles (en.json):
```text
reports.objective: "Objective"
reports.objectiveText: "This inspection aimed to verify the conditions of {{category}} according to the checklist \"{{template}}\"."
reports.verificationsTable: "Verification Table"
reports.photoRegistry: "Photo Registry"
reports.openNCs: "Open Non-Conformities"
reports.conclusion: "Conclusion"
reports.conclusionApproved: "Approved"
reports.conclusionConditional: "Conditional"
reports.conclusionRejected: "Rejected"
reports.signature: "Signature"
reports.inspector: "Inspector"
reports.inspectionDate: "Inspection Date"
reports.reference: "Reference"
reports.generalPhoto: "General"
reports.itemPhoto: "Item #{{number}}"
reports.downloadSuccess: "Report generated successfully"
reports.generalData: "General Data"
reports.conformYes: "Yes"
reports.conformNo: "No"
reports.conformNA: "N/A"
reports.conformOBS: "OBS"
```

---

## Resumo das Alteracoes

1. **pdfGenerator.ts**: Reescrever `generateInspectionReport` com estrutura completa
   - Adicionar seccao de Objectivo baseado no template
   - Melhorar tabela com formatacao Sim/Nao/N/A/OBS
   - Adicionar fotos numeradas (max 6 por pagina)
   - Adicionar lista de NCs abertas nesta inspecao
   - Adicionar seccao de Conclusao (Aprovado/Condicionado/Reprovado)
   - Adicionar area de Assinatura

2. **InspectionDetail.tsx**: Adicionar botao "Gerar PDF"
   - Visivel apenas quando status = COMPLETED
   - Estado de loading durante geracao
   - Download automatico do ficheiro

3. **Traducoes**: Novas chaves para labels do PDF em PT e EN

---

## Consideracoes Tecnicas

1. **Performance**: Limitar fotos a 6 por pagina para nao sobrecarregar o PDF
2. **Paginacao**: autoTable gere automaticamente, mas fotos precisam verificacao manual de espaco
3. **Imagens**: Usar signed URLs para bucket privado (captures)
4. **Referencia**: Gerar codigo tipo "INS-2026-001" baseado na data + indice
5. **Categoria**: Traduzir categoria do template (structure -> Estrutura, etc.)
