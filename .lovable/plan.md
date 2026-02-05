
# Plano: Servico de Geracao de PDFs

## Resumo
Instalar as bibliotecas jspdf e jspdf-autotable, e criar um servico completo de geracao de PDFs com tres funcoes principais: relatorio de inspecao, ficha de nao-conformidade, e auto de medicao.

---

## Dependencias a Instalar

```text
jspdf - Biblioteca base para geracao de PDFs
jspdf-autotable - Plugin para criar tabelas formatadas automaticamente
```

---

## Estrutura do Servico

Criar ficheiro `/src/services/pdfGenerator.ts` com:

```text
pdfGenerator.ts
├── Configuracao base (A4, margens, fonte)
├── Funcoes auxiliares
│   ├── addHeader() - Cabecalho com logo e titulo
│   ├── addFooter() - Rodape com pagina e data
│   └── loadImage() - Carregar imagens do Storage
│
├── generateInspectionReport(inspectionId)
│   ├── Dados: inspecao, template, itens, resultados, fotos
│   ├── Conteudo: cabecalho, info geral, checklist, resumo
│   └── Retorna: Blob do PDF
│
├── generateNCReport(ncId)
│   ├── Dados: NC, obra, evidencias, historico
│   ├── Conteudo: cabecalho, detalhes, fotos, timeline
│   └── Retorna: Blob do PDF
│
└── generateMeasurementAuto(siteId, period)
    ├── Dados: obra, inspecoes do periodo
    ├── Conteudo: cabecalho, resumo trabalhos, totais
    └── Retorna: Blob do PDF
```

---

## Configuracao Base do PDF

```text
Formato: A4 (210mm x 297mm)
Margens: 20mm (equivalente a ~2cm)
Fonte: Helvetica (similar a Arial, disponivel nativamente no jsPDF)
Cores:
  - Primaria: #3B82F6 (azul)
  - Texto: #1F2937 (cinza escuro)
  - Secundario: #6B7280 (cinza medio)
```

---

## Funcao 1: generateInspectionReport(inspectionId)

### Dados a Buscar:

```text
1. inspections (id, status, scheduled_at, created_by)
   └── sites (name, address)
   └── inspection_templates (name, category)
   └── floors, areas, capture_points (localizacao)

2. inspection_items (result, notes)
   └── inspection_template_items (title, is_required)

3. evidence_links + captures (fotos anexadas)

4. profiles (nome do inspector)
```

### Estrutura do Relatorio:

```text
┌─────────────────────────────────────────────────────────┐
│  [LOGO]              RELATORIO DE INSPECAO              │
│                                                          │
│  Obra: Edificio Aurora                                  │
│  Template: Pre-Betonagem Laje                           │
│  Data: 05 Fevereiro 2026                                │
│  Inspector: Joao Silva                                  │
│  Localizacao: Piso 1 > Sala A > P01                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  RESUMO                                                  │
│  ┌──────────────┬──────────────┬──────────────┐         │
│  │ Conforme: 15 │ NC: 3        │ N/A: 2       │         │
│  └──────────────┴──────────────┴──────────────┘         │
│                                                          │
│  CHECKLIST                                               │
│  ┌────┬────────────────────┬──────────┬────────────────┐│
│  │ #  │ Item               │ Resultado│ Observacoes    ││
│  ├────┼────────────────────┼──────────┼────────────────┤│
│  │ 1  │ Cofragem limpa     │ OK       │ -              ││
│  │ 2  │ Armadura conforme  │ NC       │ Falta de rec...││
│  │ 3  │ ...                │ ...      │ ...            ││
│  └────┴────────────────────┴──────────┴────────────────┘│
│                                                          │
│  FOTOS ANEXADAS (se existirem)                          │
│  ┌────────┐ ┌────────┐ ┌────────┐                       │
│  │        │ │        │ │        │                       │
│  └────────┘ └────────┘ └────────┘                       │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  Pagina 1 de 2                    Gerado em 05/02/2026  │
└─────────────────────────────────────────────────────────┘
```

---

## Funcao 2: generateNCReport(ncId)

### Dados a Buscar:

```text
1. nonconformities (todos os campos)
   └── sites (name, address)
   └── inspections > inspection_templates (nome do template)

2. nonconformity_evidence (file_path para fotos)

3. nonconformity_status_history (timeline)
   └── profiles (nome de quem alterou)

4. profiles (nome do criador)
```

### Estrutura da Ficha NC:

```text
┌─────────────────────────────────────────────────────────┐
│  [LOGO]        FICHA DE NAO-CONFORMIDADE                │
│                                                          │
│  NC-001                              Estado: EM RESOLUCAO│
│  Severidade: CRITICO                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  DADOS GERAIS                                            │
│  Obra: Edificio Aurora                                  │
│  Inspecao: Pre-Betonagem Laje                           │
│  Data Criacao: 05/02/2026                               │
│  Prazo: 15/02/2026                                      │
│  Responsavel: Pedro Santos                              │
│  Norma Violada: NP EN 206-1                             │
│                                                          │
│  ──────────────────────────────────────────────────────  │
│                                                          │
│  DESCRICAO DO PROBLEMA                                   │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Fissura detectada na laje do piso 2 com largura    ││
│  │ aproximada de 2mm, comprometendo a integridade...  ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ACAO CORRETIVA                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Injectar resina epoxy nas fissuras. Aguardar cura  ││
│  │ de 48 horas antes de proceder a verificacao...     ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  EVIDENCIAS FOTOGRAFICAS                                 │
│  ┌────────┐ ┌────────┐                                  │
│  │        │ │        │                                  │
│  │ Foto 1 │ │ Foto 2 │                                  │
│  └────────┘ └────────┘                                  │
│                                                          │
│  HISTORICO DE ALTERACOES                                 │
│  ○ 05/02/2026 10:30 - Aberta (Joao Silva)              │
│  │                                                       │
│  ○ 07/02/2026 14:15 - Em Resolucao (Pedro Santos)       │
│    "Iniciada intervencao com resina epoxy"              │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  Pagina 1 de 1                    Gerado em 05/02/2026  │
└─────────────────────────────────────────────────────────┘
```

---

## Funcao 3: generateMeasurementAuto(siteId, period)

### Dados a Buscar:

```text
1. sites (name, address, org_id)
   └── organizations (name - dono da obra)

2. inspections do periodo
   └── inspection_templates (nome)
   └── inspection_items (resumo de resultados)

3. nonconformities do periodo (resumo)
```

### Estrutura do Auto de Medicao:

```text
┌─────────────────────────────────────────────────────────┐
│  [LOGO]              AUTO DE MEDICAO                    │
│                                                          │
│  Periodo: 01/01/2026 a 31/01/2026                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  IDENTIFICACAO                                           │
│  Obra: Edificio Aurora                                  │
│  Morada: Rua das Flores, 123, Lisboa                    │
│  Dono de Obra: Empresa XYZ, Lda                         │
│  Fiscalizacao: SitePulse                                │
│                                                          │
│  ──────────────────────────────────────────────────────  │
│                                                          │
│  RESUMO DO PERIODO                                       │
│  ┌───────────────────────────────┬─────────────────────┐│
│  │ Fiscalizacoes Realizadas      │ 12                  ││
│  │ Itens Verificados             │ 156                 ││
│  │ Conformes                     │ 142 (91%)           ││
│  │ Nao Conformes                 │ 8 (5%)              ││
│  │ Observacoes                   │ 6 (4%)              ││
│  └───────────────────────────────┴─────────────────────┘│
│                                                          │
│  NAO-CONFORMIDADES DO PERIODO                            │
│  ┌────┬─────────────────┬──────────┬───────────────────┐│
│  │ NC │ Descricao       │ Severid. │ Estado            ││
│  ├────┼─────────────────┼──────────┼───────────────────┤│
│  │ 001│ Fissura laje    │ Critico  │ Em Resolucao     ││
│  │ 002│ Infiltracao     │ Importante│ Fechada          ││
│  └────┴─────────────────┴──────────┴───────────────────┘│
│                                                          │
│  OBSERVACOES GERAIS                                      │
│  [Espaco para notas adicionais]                         │
│                                                          │
│  ──────────────────────────────────────────────────────  │
│                                                          │
│  ASSINATURAS                                             │
│  Fiscalizacao: ___________________ Data: ___________    │
│  Dono de Obra: ___________________ Data: ___________    │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  Pagina 1 de 1                    Gerado em 05/02/2026  │
└─────────────────────────────────────────────────────────┘
```

---

## Implementacao Tecnica

### Estrutura do Ficheiro pdfGenerator.ts:

```text
// Importacoes
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

// Constantes de configuracao
const PAGE_WIDTH = 210;  // mm (A4)
const PAGE_HEIGHT = 297; // mm (A4)
const MARGIN = 20;       // mm (~2cm)
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

// Cores
const COLORS = {
  primary: [59, 130, 246],    // #3B82F6
  text: [31, 41, 55],         // #1F2937
  secondary: [107, 114, 128], // #6B7280
  success: [34, 197, 94],     // #22C55E
  danger: [239, 68, 68],      // #EF4444
  warning: [234, 179, 8],     // #EAB308
};

// Funcao auxiliar para adicionar cabecalho
function addHeader(doc: jsPDF, title: string): number

// Funcao auxiliar para adicionar rodape
function addFooter(doc: jsPDF, pageNum: number, totalPages: number): void

// Funcao para carregar imagem do Storage
async function loadImageFromStorage(filePath: string): Promise<string | null>

// Funcoes principais exportadas
export async function generateInspectionReport(inspectionId: string): Promise<Blob>
export async function generateNCReport(ncId: string): Promise<Blob>
export async function generateMeasurementAuto(siteId: string, period: { start: Date; end: Date }): Promise<Blob>
```

### Utilizacao nos Componentes:

```text
import { generateInspectionReport, generateNCReport } from '@/services/pdfGenerator';

// Exemplo de uso
const handleDownloadReport = async () => {
  setIsGenerating(true);
  try {
    const blob = await generateInspectionReport(inspectionId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-inspecao-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast({ title: t('common.error'), variant: 'destructive' });
  } finally {
    setIsGenerating(false);
  }
};
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| package.json | Adicionar jspdf e jspdf-autotable |
| src/services/pdfGenerator.ts | Criar (servico principal) |
| src/i18n/locales/pt.json | Adicionar chaves de traducao |
| src/i18n/locales/en.json | Adicionar chaves de traducao |

---

## Traducoes a Adicionar

```text
reports.inspectionReport: "Relatorio de Inspecao"
reports.ncReport: "Ficha de Nao-Conformidade"
reports.measurementAuto: "Auto de Medicao"
reports.generating: "A gerar PDF..."
reports.downloadPdf: "Descarregar PDF"
reports.summary: "Resumo"
reports.compliant: "Conforme"
reports.nonCompliant: "Nao Conforme"
reports.observations: "Observacoes"
reports.notApplicable: "N/A"
reports.period: "Periodo"
reports.generalInfo: "Informacao Geral"
reports.checklist: "Checklist"
reports.photos: "Fotos"
reports.history: "Historico"
reports.signatures: "Assinaturas"
reports.generatedAt: "Gerado em"
reports.page: "Pagina"
reports.of: "de"
```

---

## Consideracoes Tecnicas

1. **Fonte**: jsPDF nao suporta Arial nativamente. Usar Helvetica (muito similar) que e a fonte padrao.

2. **Imagens**: As fotos do Storage devem ser convertidas para base64 antes de inserir no PDF. Limitar tamanho para performance.

3. **Logo Placeholder**: Usar um retangulo cinza com texto "LOGO" ate ter logo real.

4. **Paginacao**: autoTable ja lida automaticamente com quebras de pagina.

5. **Tamanho do Ficheiro**: Comprimir imagens antes de inserir. Limitar a 10 fotos por relatorio para manter tamanho razoavel.

6. **Caracteres Especiais**: jsPDF suporta UTF-8, mas os acentos portugueses funcionam bem com a fonte padrao.

---

## Resumo das Alteracoes

1. **Instalar dependencias**: jspdf e jspdf-autotable
2. **Criar servico**: /src/services/pdfGenerator.ts com 3 funcoes principais
3. **Funcoes auxiliares**: addHeader, addFooter, loadImageFromStorage
4. **Traducoes**: Novas chaves em PT e EN para labels dos PDFs
