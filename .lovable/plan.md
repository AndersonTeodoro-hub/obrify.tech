
# Plano: Adicionar Analise IA ao CaptureViewer

## Resumo
Adicionar funcionalidade de analise de imagens com IA ao visualizador de capturas, integrando com a Edge Function `ai-image-analysis` ja existente. Inclui botao de analise com dropdown de opcoes, painel de resultados, e criacao de NCs a partir de deteccoes.

---

## Analise do Estado Actual

### CaptureViewer.tsx:
- Ja tem toolbar com accoes (info, download, NC, delete)
- Ja tem CaptureInfoPanel lateral (w-80)
- Ja integra com CreateNCModal
- Ja carrega imagens via signed URL

### Edge Function ai-image-analysis:
- Aceita `{ capture_id, analysis_type: 'defects' | 'rebar' | 'general' }`
- Retorna `{ detections, overall_assessment, recommendations, results_saved }`
- Guarda resultados em `ai_analysis_results`

### Tabela captures:
- Nao tem flag `ai_analyzed` - precisa de adicionar

### Tabela ai_analysis_results:
- Ja tem todos os campos necessarios
- Relaciona com capture_id

---

## Alteracoes Necessarias

### 1. Migracao de Base de Dados

Adicionar campo `ai_analyzed` a tabela `captures`:

```sql
ALTER TABLE public.captures 
ADD COLUMN ai_analyzed boolean DEFAULT false;

ALTER TABLE public.captures 
ADD COLUMN ai_analyzed_at timestamp with time zone;
```

### 2. Novo Componente: AIAnalysisPanel

Painel lateral que mostra resultados da analise:

```text
AIAnalysisPanel.tsx
├── Header com titulo e botao fechar
├── Estado: loading | results | error
├── Loading: Spinner + mensagem
├── Results:
│   ├── Overall Assessment (texto)
│   ├── Lista de Deteccoes
│   │   ├── Badge de severidade (cor)
│   │   ├── Tipo + Descricao
│   │   ├── Localizacao
│   │   ├── Confianca (%)
│   │   └── Botao "Criar NC" (se critical/major)
│   └── Recomendacoes (lista)
└── Botao "Nova Analise" para repetir
```

### 3. Modificar CaptureViewer.tsx

Alteracoes necessarias:

1. **Novos estados:**
   - `showAIPanel: boolean`
   - `isAnalyzing: boolean`
   - `aiResults: AnalysisResult | null`
   - `selectedDetection: Detection | null` (para criar NC)

2. **Novo botao na toolbar:**
   - Icone: `Sparkles` (lucide-react)
   - Dropdown com 3 opcoes:
     - Detectar Defeitos
     - Verificar Armaduras
     - Analise Geral
   - Mostra loading enquanto analisa

3. **Integracao com AIAnalysisPanel:**
   - Mostrar a direita (como CaptureInfoPanel)
   - Posicionar botao "next" correctamente

4. **Criar NC a partir de deteccao:**
   - Pre-preencher CreateNCModal com dados da deteccao
   - Mapear severity: critical->critical, major->high, minor->medium, observation->low

---

## Estrutura Visual

```text
┌─────────────────────────────────────────────────────────────────┐
│  1/10  ▲────────────────────────────────────────────── [⚡AI▼]  │
│        │                                                [ℹ][⬇] │
│        │                                                [⚠][🗑] │
├────────┼────────────────────────────────────────────────[✕]────┤
│        │                                                        │
│   ◀    │              [IMAGEM]                            │  ▶  │
│        │                                                  │     │
│        │                                                  │     │
├────────┼──────────────────────────────────────────────────┼─────┤
│        │                                                  │     │
│        │                                        AI PANEL  │     │
│        │                                        ────────  │     │
│        │                                        Avaliação │     │
│        │                                        Geral...  │     │
│        │                                                  │     │
│        │                                        Deteccoes │     │
│        │                                        ┌───────┐ │     │
│        │                                        │🔴 CRIT│ │     │
│        │                                        │Fissura│ │     │
│        │                                        │[NC]   │ │     │
│        │                                        └───────┘ │     │
│        │                                                  │     │
│        │                                        Recomend. │     │
│        │                                        • Item 1  │     │
│        │                                        • Item 2  │     │
└────────┴──────────────────────────────────────────────────┴─────┘
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/components/captures/AIAnalysisPanel.tsx | Criar |
| src/components/captures/CaptureViewer.tsx | Modificar |
| src/components/captures/CreateNCModal.tsx | Modificar (aceitar dados pre-preenchidos) |
| src/types/captures.ts | Adicionar tipos AIAnalysisResult |
| src/i18n/locales/pt.json | Adicionar traducoes |
| src/i18n/locales/en.json | Adicionar traducoes |
| Migracao SQL | Adicionar campo ai_analyzed |

---

## Tipos a Adicionar (types/captures.ts)

```typescript
export interface AIDetection {
  type: string;
  description: string;
  severity: 'critical' | 'major' | 'minor' | 'observation';
  location: string;
  confidence: number;
  measurements?: {
    estimated_width_mm?: number;
    estimated_length_cm?: number;
    estimated_spacing_cm?: number;
  };
}

export interface AIAnalysisResult {
  success: boolean;
  capture_id: string;
  analysis_type: 'defects' | 'rebar' | 'general';
  detections: AIDetection[];
  overall_assessment: string;
  recommendations: string[];
  results_saved: number;
}
```

---

## AIAnalysisPanel.tsx - Estrutura

```text
Props:
- isLoading: boolean
- results: AIAnalysisResult | null
- error: string | null
- onClose: () => void
- onCreateNC: (detection: AIDetection) => void
- onRetry: () => void
- className?: string

Badges de severidade:
- critical: bg-red-500 text-white
- major: bg-orange-500 text-white
- minor: bg-yellow-500 text-black
- observation: bg-blue-500 text-white

Secoes:
1. Header fixo com titulo e X
2. ScrollArea para conteudo
3. Loading state com Loader2 animado
4. Error state com mensagem e botao retry
5. Results state:
   - Card com overall_assessment
   - Lista de deteccoes com cards
   - Lista de recomendacoes
```

---

## Modificacoes no CaptureViewer.tsx

### Novos imports:

```typescript
import { Sparkles } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { AIAnalysisPanel } from './AIAnalysisPanel';
import type { AIAnalysisResult, AIDetection } from '@/types/captures';
```

### Novos estados:

```typescript
const [showAIPanel, setShowAIPanel] = useState(false);
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [aiResults, setAiResults] = useState<AIAnalysisResult | null>(null);
const [aiError, setAiError] = useState<string | null>(null);
const [ncPreFillData, setNcPreFillData] = useState<{
  title: string;
  description: string;
  severity: string;
} | null>(null);
```

### Funcao de analise:

```typescript
const handleAIAnalysis = async (analysisType: 'defects' | 'rebar' | 'general') => {
  if (!capture) return;
  
  setIsAnalyzing(true);
  setAiError(null);
  setShowAIPanel(true);
  
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-image-analysis`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          capture_id: capture.id,
          analysis_type: analysisType,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Analysis failed');
    }

    const results = await response.json();
    setAiResults(results);
    
    // Marcar captura como analisada
    await supabase
      .from('captures')
      .update({ ai_analyzed: true, ai_analyzed_at: new Date().toISOString() })
      .eq('id', capture.id);
      
  } catch (err) {
    setAiError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    setIsAnalyzing(false);
  }
};
```

### Criar NC a partir de deteccao:

```typescript
const handleCreateNCFromDetection = (detection: AIDetection) => {
  const severityMap: Record<string, string> = {
    critical: 'critical',
    major: 'high',
    minor: 'medium',
    observation: 'low',
  };
  
  setNcPreFillData({
    title: `${detection.type}: ${detection.description.slice(0, 50)}`,
    description: `${detection.description}\n\nLocalização: ${detection.location}\nConfiança: ${Math.round(detection.confidence * 100)}%`,
    severity: severityMap[detection.severity] || 'medium',
  });
  setShowNCModal(true);
};
```

### Dropdown na toolbar:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      className="text-white hover:bg-white/20"
      disabled={isAnalyzing || !imageUrl}
    >
      {isAnalyzing ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Sparkles className="w-5 h-5" />
      )}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => handleAIAnalysis('defects')}>
      {t('captures.ai.detectDefects')}
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleAIAnalysis('rebar')}>
      {t('captures.ai.verifyRebar')}
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleAIAnalysis('general')}>
      {t('captures.ai.generalAnalysis')}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Modificacoes no CreateNCModal.tsx

Aceitar props opcionais de pre-preenchimento:

```typescript
interface CreateNCModalProps {
  capture: CaptureWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  prefillData?: {
    title: string;
    description: string;
    severity: string;
  };
}
```

E usar no useForm:

```typescript
const form = useForm<NCFormData>({
  resolver: zodResolver(ncSchema),
  defaultValues: {
    title: prefillData?.title || '',
    description: prefillData?.description || '',
    severity: (prefillData?.severity as any) || 'medium',
  },
});

// Reset quando prefillData muda
useEffect(() => {
  if (prefillData) {
    form.reset({
      title: prefillData.title,
      description: prefillData.description,
      severity: prefillData.severity as any,
    });
  }
}, [prefillData, form]);
```

---

## Traducoes a Adicionar

### Portugues (pt.json):

```json
"captures": {
  "ai": {
    "analyzeWithAI": "Analisar com IA",
    "detectDefects": "Detectar Defeitos",
    "verifyRebar": "Verificar Armaduras",
    "generalAnalysis": "Análise Geral",
    "analyzing": "A analisar imagem...",
    "analysisComplete": "Análise concluída",
    "analysisError": "Erro na análise",
    "overallAssessment": "Avaliação Geral",
    "detections": "Detecções",
    "noDetections": "Nenhum problema detectado",
    "recommendations": "Recomendações",
    "confidence": "Confiança",
    "location": "Localização",
    "createNC": "Criar NC",
    "retry": "Tentar Novamente",
    "newAnalysis": "Nova Análise",
    "severity": {
      "critical": "Crítico",
      "major": "Importante",
      "minor": "Menor",
      "observation": "Observação"
    }
  }
}
```

### Ingles (en.json):

```json
"captures": {
  "ai": {
    "analyzeWithAI": "Analyze with AI",
    "detectDefects": "Detect Defects",
    "verifyRebar": "Verify Rebar",
    "generalAnalysis": "General Analysis",
    "analyzing": "Analyzing image...",
    "analysisComplete": "Analysis complete",
    "analysisError": "Analysis error",
    "overallAssessment": "Overall Assessment",
    "detections": "Detections",
    "noDetections": "No issues detected",
    "recommendations": "Recommendations",
    "confidence": "Confidence",
    "location": "Location",
    "createNC": "Create NC",
    "retry": "Retry",
    "newAnalysis": "New Analysis",
    "severity": {
      "critical": "Critical",
      "major": "Major",
      "minor": "Minor",
      "observation": "Observation"
    }
  }
}
```

---

## Layout do Painel de Resultados

O AIAnalysisPanel fica posicionado de forma similar ao CaptureInfoPanel:
- Largura fixa: w-80 (320px)
- Posicao absoluta a direita
- Pode coexistir com o InfoPanel (lado a lado) ou substituir

Para simplicidade, quando showAIPanel = true, escondemos o InfoPanel (toggle entre os dois).

---

## Fluxo de Utilizacao

```text
1. Utilizador abre CaptureViewer
       │
       ▼
2. Clica no botao ⚡ (Sparkles)
       │
       ▼
3. Seleciona tipo de analise no dropdown
       │
       ▼
4. Mostra painel lateral com loading
       │
       ▼
5. Edge Function processa imagem
       │
       ▼
6. Resultados aparecem no painel:
   - Avaliacao geral
   - Lista de deteccoes com badges
   - Recomendacoes
       │
       ▼
7. Para deteccoes critical/major:
   - Botao "Criar NC" disponivel
   - Abre CreateNCModal pre-preenchido
       │
       ▼
8. Captura marcada como ai_analyzed = true
```

---

## Resumo das Alteracoes

1. **Migracao SQL**: Adicionar campos `ai_analyzed` e `ai_analyzed_at` na tabela captures
2. **AIAnalysisPanel.tsx**: Novo componente para mostrar resultados da analise
3. **CaptureViewer.tsx**: Adicionar dropdown de analise IA e integracao com painel
4. **CreateNCModal.tsx**: Aceitar dados pre-preenchidos
5. **types/captures.ts**: Adicionar tipos para AIDetection e AIAnalysisResult
6. **Traducoes**: Novas chaves para PT e EN

---

## Consideracoes Tecnicas

1. **Painel exclusivo**: Quando AI panel esta aberto, Info panel fecha (e vice-versa)
2. **Cache de resultados**: Guardar aiResults no state para nao perder ao navegar
3. **Rate limiting**: Tratar erros 429 com mensagem amigavel
4. **Timeout**: A analise pode demorar 10-30s, manter loading visivel
5. **Videos/Panoramas**: Desactivar botao de analise para conteudo nao-imagem
