
# Plano: Implementacao Completa da Pagina Reports.tsx

## Resumo
Transformar a pagina placeholder `Reports.tsx` numa central de relatorios completa com tres seccoes: Relatorios de Inspecao, Relatorios de NC, e Autos de Medicao. Inclui geracao e armazenamento de PDFs na tabela `documents`.

---

## Analise do Estado Actual

### Pagina Reports.tsx:
- Actualmente e um placeholder com mensagem "Sem resultados"
- Nao tem nenhuma funcionalidade implementada

### Servico pdfGenerator.ts:
- Ja tem 3 funcoes implementadas:
  - `generateInspectionReport(inspectionId)` - funcional
  - `generateNCReport(ncId)` - funcional
  - `generateMeasurementAuto(siteId, period)` - funcional

### Tabela documents:
- Colunas: id, name, file_path, doc_type, site_id, org_id, created_at
- Ja usada em SiteDocumentsTab.tsx
- Pode ser usada para guardar historico de relatorios gerados

### Storage Bucket:
- Bucket `captures` ja existe (privado)
- Precisa de novo bucket `documents` para PDFs (ou usar o existente)

---

## Arquitectura da Pagina

```text
Reports.tsx
├── Header
│   └── Titulo + Subtitulo
│
├── Tabs ou Seccoes
│   ├── Relatorios de Inspecao
│   │   ├── Filtro por Obra
│   │   ├── Lista de inspecoes COMPLETED
│   │   └── Botao PDF para cada
│   │
│   ├── Relatorios de NC
│   │   ├── Sub-seccao: NCs Abertas por Obra
│   │   │   ├── Select de Obra
│   │   │   └── Botao gerar lista PDF
│   │   │
│   │   └── Sub-seccao: Historico de NCs
│   │       ├── Selectors de periodo
│   │       └── Botao gerar PDF
│   │
│   └── Autos de Medicao
│       └── Placeholder para fase futura
│
└── Historico de Relatorios Gerados
    └── Tabela com documentos tipo "report"
```

---

## Estrutura Visual

```text
┌─────────────────────────────────────────────────────────────────┐
│  Relatórios                                                      │
│  Central de relatórios e documentação                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  RELATÓRIOS DE INSPEÇÃO                                     ││
│  │                                                              ││
│  │  ┌─────────────┐                                            ││
│  │  │ Obra ▼      │                                            ││
│  │  └─────────────┘                                            ││
│  │                                                              ││
│  │  ┌────────┬────────────┬────────────┬──────────┬──────────┐││
│  │  │ Data   │ Obra       │ Template   │ Estado   │ Acões    │││
│  │  ├────────┼────────────┼────────────┼──────────┼──────────┤││
│  │  │05 Fev  │ Aurora     │ Pre-Beton  │Concluída │ [📄 PDF] │││
│  │  │03 Fev  │ Mar        │ Segurança  │Concluída │ [📄 PDF] │││
│  │  └────────┴────────────┴────────────┴──────────┴──────────┘││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  RELATÓRIOS DE NÃO-CONFORMIDADES                            ││
│  │                                                              ││
│  │  ┌──────────────────────────────┐  ┌──────────────────────┐ ││
│  │  │  NCs Abertas por Obra        │  │  Histórico de NCs    │ ││
│  │  │  ┌─────────────┐             │  │  De: [___] Até: [___]│ ││
│  │  │  │ Obra ▼      │             │  │  ┌─────────────┐     │ ││
│  │  │  └─────────────┘             │  │  │ Obra ▼      │     │ ││
│  │  │        [📄 Gerar Lista]      │  │  └─────────────┘     │ ││
│  │  │                              │  │        [📄 Gerar]    │ ││
│  │  └──────────────────────────────┘  └──────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  AUTOS DE MEDIÇÃO                      [Em desenvolvimento] ││
│  │                                                              ││
│  │  Esta funcionalidade estará disponível numa versão futura.  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  HISTÓRICO DE RELATÓRIOS                                    ││
│  │                                                              ││
│  │  ┌──────────┬────────────┬────────────┬──────────┬────────┐││
│  │  │ Tipo     │ Obra       │ Gerado em  │ Por      │ Acões  │││
│  │  ├──────────┼────────────┼────────────┼──────────┼────────┤││
│  │  │Inspeção  │ Aurora     │ 05/02 15:30│ João     │ [📥]   │││
│  │  │NC Lista  │ Mar        │ 04/02 10:15│ Pedro    │ [📥]   │││
│  │  └──────────┴────────────┴────────────┴──────────┴────────┘││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Ficheiros a Modificar/Criar

| Ficheiro | Accao |
|----------|-------|
| src/pages/app/Reports.tsx | Reescrever completamente |
| src/services/pdfGenerator.ts | Adicionar funcao generateOpenNCsReport |
| src/i18n/locales/pt.json | Adicionar novas chaves |
| src/i18n/locales/en.json | Adicionar novas chaves |

### Migracao de Base de Dados
Criar bucket de storage para documentos (se nao existir):

```sql
-- Apenas se necessario criar bucket via SQL
-- Normalmente criado via dashboard/API
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
```

---

## Novas Funcoes no pdfGenerator.ts

### generateOpenNCsReport(siteId)

Gera lista de todas as NCs abertas (nao CLOSED) para uma obra especifica:

```text
┌─────────────────────────────────────────────────────────────────┐
│  [LOGO]       LISTA DE NÃO-CONFORMIDADES ABERTAS                │
│                                                                  │
│  Obra: Edifício Aurora                 Data: 05/02/2026         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  RESUMO                                                          │
│  Total de NCs Abertas: 5                                        │
│  Críticas: 1 | Importantes: 2 | Menores: 2                      │
│                                                                  │
│  LISTA DETALHADA                                                 │
│  ┌────┬────────────────┬──────────┬───────────┬────────────────┐│
│  │ NC │ Descrição      │ Sever.   │ Prazo     │ Responsável    ││
│  ├────┼────────────────┼──────────┼───────────┼────────────────┤│
│  │001 │ Fissura laje   │ Crítico  │ 15/02     │ Pedro Santos   ││
│  │002 │ Infiltração    │ Import.  │ 20/02     │ João Silva     ││
│  └────┴────────────────┴──────────┴───────────┴────────────────┘│
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Página 1 de 1                    Gerado em 05/02/2026 15:30   │
└─────────────────────────────────────────────────────────────────┘
```

### generateNCHistoryReport(siteId, period)

Gera historico de NCs fechadas num periodo:

```text
┌─────────────────────────────────────────────────────────────────┐
│  [LOGO]       HISTÓRICO DE NÃO-CONFORMIDADES                    │
│                                                                  │
│  Obra: Edifício Aurora                                          │
│  Período: 01/01/2026 a 31/01/2026                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  RESUMO DO PERÍODO                                               │
│  NCs Abertas: 8 | NCs Fechadas: 6 | Taxa de Resolução: 75%     │
│                                                                  │
│  NÃO-CONFORMIDADES FECHADAS                                      │
│  ┌────┬────────────────┬──────────┬───────────┬────────────────┐│
│  │ NC │ Descrição      │ Aberta   │ Fechada   │ Dias           ││
│  ├────┼────────────────┼──────────┼───────────┼────────────────┤│
│  │001 │ Fissura laje   │ 05/01    │ 15/01     │ 10 dias        ││
│  │002 │ Infiltração    │ 10/01    │ 22/01     │ 12 dias        ││
│  └────┴────────────────┴──────────┴───────────┴────────────────┘│
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Página 1 de 1                    Gerado em 05/02/2026 15:30   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Componente Reports.tsx

### Estado e Queries:

```text
Estados:
- siteFilter: string (para inspecoes)
- ncSiteFilter: string (para NCs abertas)
- historySiteFilter: string (para historico)
- historyPeriod: { start: Date, end: Date }
- generatingReport: Record<string, boolean>

Queries:
1. sites - lista de obras do utilizador
2. completedInspections - inspecoes com status COMPLETED
3. generatedReports - documentos com doc_type contendo 'report'
```

### Funcoes de Geracao:

```text
handleGenerateInspectionPDF(inspectionId, siteName):
  1. setGeneratingReport({ [inspectionId]: true })
  2. const blob = await generateInspectionReport(inspectionId)
  3. Upload blob para Storage bucket 'documents'
  4. Inserir registo na tabela 'documents'
  5. Trigger download do ficheiro
  6. Toast de sucesso
  7. Refetch generatedReports

handleGenerateOpenNCsPDF(siteId, siteName):
  1. setGeneratingReport({ openNCs: true })
  2. const blob = await generateOpenNCsReport(siteId)
  3. Upload + save + download
  4. Toast de sucesso

handleGenerateNCHistoryPDF(siteId, period, siteName):
  1. setGeneratingReport({ ncHistory: true })
  2. const blob = await generateNCHistoryReport(siteId, period)
  3. Upload + save + download
  4. Toast de sucesso
```

---

## Armazenamento de PDFs

### Upload para Storage:

```text
const uploadPDF = async (blob: Blob, fileName: string) => {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const filePath = `reports/${siteId}/${fileName}`;
  
  const { error } = await supabase.storage
    .from('documents')
    .upload(filePath, file);
    
  if (error) throw error;
  return filePath;
};
```

### Registo na tabela documents:

```text
const saveDocumentRecord = async (
  name: string,
  filePath: string,
  docType: string,
  siteId: string,
  orgId: string
) => {
  const { error } = await supabase.from('documents').insert({
    name,
    file_path: filePath,
    doc_type: docType,
    site_id: siteId,
    org_id: orgId,
  });
  
  if (error) throw error;
};
```

### Tipos de documento:

- `inspection_report` - Relatorio de inspecao
- `nc_open_list` - Lista de NCs abertas
- `nc_history` - Historico de NCs
- `measurement_auto` - Auto de medicao (futuro)

---

## Traducoes a Adicionar

### Portugues (pt.json):

```text
"reportsPage": {
  "title": "Relatórios",
  "subtitle": "Central de relatórios e documentação",
  "inspectionReports": "Relatórios de Inspeção",
  "inspectionReportsDesc": "Gerar relatórios de inspeções concluídas",
  "ncReports": "Relatórios de Não-Conformidades",
  "openNCsBysite": "NCs Abertas por Obra",
  "openNCsBySiteDesc": "Lista de todas as NCs abertas numa obra",
  "ncHistory": "Histórico de NCs",
  "ncHistoryDesc": "NCs fechadas num período específico",
  "measurementAutos": "Autos de Medição",
  "measurementAutosDesc": "Esta funcionalidade estará disponível numa versão futura",
  "comingSoon": "Em desenvolvimento",
  "generatedReports": "Histórico de Relatórios",
  "generatedReportsDesc": "Relatórios gerados anteriormente",
  "noCompletedInspections": "Não existem inspeções concluídas",
  "generateReport": "Gerar Relatório",
  "generateList": "Gerar Lista",
  "selectSite": "Selecionar obra",
  "selectPeriod": "Selecionar período",
  "from": "De",
  "to": "Até",
  "reportType": "Tipo",
  "generatedAt": "Gerado em",
  "generatedBy": "Por",
  "download": "Descarregar",
  "noReports": "Ainda não foram gerados relatórios",
  "reportSaved": "Relatório guardado com sucesso",
  "types": {
    "inspection_report": "Relatório de Inspeção",
    "nc_open_list": "Lista NCs Abertas",
    "nc_history": "Histórico de NCs",
    "measurement_auto": "Auto de Medição"
  }
}
```

### Ingles (en.json):

```text
"reportsPage": {
  "title": "Reports",
  "subtitle": "Reports and documentation center",
  "inspectionReports": "Inspection Reports",
  "inspectionReportsDesc": "Generate reports for completed inspections",
  "ncReports": "Non-Conformity Reports",
  "openNCsBysite": "Open NCs by Site",
  "openNCsBySiteDesc": "List of all open NCs for a site",
  "ncHistory": "NC History",
  "ncHistoryDesc": "Closed NCs in a specific period",
  "measurementAutos": "Measurement Reports",
  "measurementAutosDesc": "This feature will be available in a future version",
  "comingSoon": "Coming soon",
  "generatedReports": "Report History",
  "generatedReportsDesc": "Previously generated reports",
  "noCompletedInspections": "No completed inspections",
  "generateReport": "Generate Report",
  "generateList": "Generate List",
  "selectSite": "Select site",
  "selectPeriod": "Select period",
  "from": "From",
  "to": "To",
  "reportType": "Type",
  "generatedAt": "Generated at",
  "generatedBy": "By",
  "download": "Download",
  "noReports": "No reports generated yet",
  "reportSaved": "Report saved successfully",
  "types": {
    "inspection_report": "Inspection Report",
    "nc_open_list": "Open NCs List",
    "nc_history": "NC History",
    "measurement_auto": "Measurement Report"
  }
}
```

---

## Fluxo de Geracao e Download

```text
1. Utilizador clica "Gerar PDF"
       │
       ▼
2. Mostrar loading no botao
       │
       ▼
3. Chamar funcao do pdfGenerator
       │
       ▼
4. Receber Blob do PDF
       │
       ▼
5. Upload para Storage bucket
       │
       ▼
6. Inserir registo em 'documents'
       │
       ▼
7. Trigger download automatico
       │
       ▼
8. Toast de sucesso
       │
       ▼
9. Actualizar lista de historico
```

---

## Storage Bucket

Verificar se o bucket `documents` existe, caso contrario criar:
- Nome: `documents`
- Publico: Nao (privado)
- Politica: Usar signed URLs para download

---

## Resumo das Alteracoes

1. **Reports.tsx**: Reescrever com 4 seccoes (Inspecoes, NCs, Autos, Historico)
2. **pdfGenerator.ts**: Adicionar `generateOpenNCsReport` e `generateNCHistoryReport`
3. **Storage**: Criar bucket `documents` se necessario
4. **Traducoes**: Novas chaves `reportsPage` em PT e EN
5. **Integracao**: Upload PDFs + guardar em `documents` table

---

## Consideracoes Tecnicas

1. **Performance**: Limitar historico aos ultimos 50 relatorios
2. **Storage**: Organizar por `reports/{siteId}/{filename}`
3. **Nomes de ficheiro**: `tipo_obra_data.pdf` (ex: `inspecao_aurora_2026-02-05.pdf`)
4. **RLS**: Usar politicas existentes da tabela `documents`
5. **Bucket**: Pode usar bucket existente ou criar novo `documents`
