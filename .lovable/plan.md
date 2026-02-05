

# Plano: Edge Function 'ai-image-analysis'

## Resumo
Criar uma nova Edge Function que recebe um `capture_id` e um `analysis_type`, busca a imagem do bucket de Storage, envia para Gemini Vision com prompts especificos para construcao civil, e guarda os resultados na tabela `ai_analysis_results`.

---

## Analise do Estado Actual

### Tabela ai_analysis_results (ja existe):
```
- id: uuid
- capture_id: string (FK -> captures)
- site_id: string (FK -> sites)
- detection_type: enum (fissura, humidade, desalinhamento, medicao, defeito_estrutural, corrosao, infiltracao)
- description: string
- severity: string
- confidence: number
- bounding_box: json
- measurements: json
- raw_response: json
- ai_model: string
- is_false_positive: boolean
- verified_at: timestamp
- verified_by: uuid
- created_at: timestamp
```

### Tabela captures:
```
- id: uuid
- file_path: string (caminho no Storage)
- capture_point_id: string (FK -> capture_points -> areas -> floors -> sites)
- source_type: enum
- processing_status: enum
```

### Bucket de Storage:
- Nome: `captures` (privado)
- Ficheiros armazenados com file_path relativo

### Edge Function existente:
- `ai-fiscal-agent` usa Lovable AI Gateway com Gemini
- Pattern de CORS, error handling, streaming

---

## Arquitectura da Edge Function

```text
ai-image-analysis/index.ts
│
├── 1. Validar request (capture_id, analysis_type)
│
├── 2. Buscar capture da base de dados
│   └── Obter file_path e site_id (via joins)
│
├── 3. Gerar signed URL do Storage
│   └── Usar supabase.storage.createSignedUrl()
│
├── 4. Construir prompt baseado no analysis_type
│   ├── 'defects' → detectar fissuras, manchas, segregacao
│   ├── 'rebar' → verificar espacamentos, recobrimentos
│   └── 'general' → avaliacao geral de conformidade
│
├── 5. Chamar Gemini Vision via Lovable AI Gateway
│   └── Usar modelo google/gemini-2.5-flash com imagem
│
├── 6. Parsear resposta JSON estruturada
│   ├── detections: array de deteccoes
│   ├── overall_assessment: texto resumo
│   └── recommendations: array de sugestoes
│
├── 7. Inserir resultados em ai_analysis_results
│   └── Um registo por deteccao encontrada
│
└── 8. Retornar resultado ao cliente
```

---

## Prompts por Tipo de Analise

### defects (Deteccao de Defeitos)

```text
Es um especialista em fiscalizacao de obras de construcao civil em Portugal.
Analisa esta imagem e detecta todos os defeitos visiveis.

Procura especificamente por:
- Fissuras (orientacao, largura estimada, padrao)
- Manchas de humidade ou infiltracao
- Segregacao do betao (ninhos de brita)
- Desagregacao superficial
- Eflorescencias (manchas brancas de sais)
- Corrosao de armaduras expostas
- Desalinhamentos ou deformacoes

Para cada defeito encontrado, classifica a severidade:
- critical: Compromete seguranca estrutural
- major: Requer intervencao urgente
- minor: Manutencao preventiva recomendada
- observation: Apenas monitorizar

Responde APENAS com JSON valido no formato especificado.
```

### rebar (Verificacao de Armaduras)

```text
Es um especialista em fiscalizacao de armaduras de betao armado.
Analisa esta imagem de armaduras e verifica:

- Espacamento entre varoes (se visivel)
- Recobrimento aparente
- Posicionamento dos estribos
- Amarracoes e sobreposicoes
- Calcadores/espacadores presentes
- Estado geral da armadura (oxidacao, sujidade)

Para cada observacao, indica:
- Se esta conforme ou nao conforme
- Medicoes estimadas (se possivel)
- Localizacao na imagem

Responde APENAS com JSON valido no formato especificado.
```

### general (Avaliacao Geral)

```text
Es um engenheiro fiscal de obras de construcao civil.
Faz uma avaliacao geral do estado de conformidade visivel nesta imagem.

Considera:
- Qualidade geral da execucao
- Organizacao e limpeza da obra
- Seguranca visivel (EPI, proteccoes)
- Estado dos materiais
- Progresso aparente dos trabalhos

Identifica qualquer situacao que justifique atencao ou registo.

Responde APENAS com JSON valido no formato especificado.
```

---

## Estrutura da Resposta JSON (Tool Calling)

```json
{
  "detections": [
    {
      "type": "fissura",
      "description": "Fissura diagonal no canto superior direito",
      "severity": "major",
      "location": "canto superior direito, aproximadamente 15cm do bordo",
      "confidence": 0.85,
      "measurements": {
        "estimated_width_mm": 2,
        "estimated_length_cm": 30
      }
    }
  ],
  "overall_assessment": "A laje apresenta sinais de assentamento diferencial...",
  "recommendations": [
    "Monitorizar evolucao da fissura com testemunhos",
    "Realizar ensaio de carbonatacao na zona afectada"
  ]
}
```

---

## Mapeamento detection_type

Os tipos do enum existente serao mapeados assim:

| Tipo detectado | Enum ai_detection_type |
|----------------|----------------------|
| fissura, crack | fissura |
| humidade, moisture | humidade |
| desalinhamento, misalignment | desalinhamento |
| medicao, measurement | medicao |
| defeito_estrutural, structural | defeito_estrutural |
| corrosao, corrosion, rust | corrosao |
| infiltracao, infiltration, leak | infiltracao |

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| supabase/functions/ai-image-analysis/index.ts | Criar |
| supabase/config.toml | Adicionar entrada para nova funcao |

---

## Codigo da Edge Function

### Estrutura Principal:

```text
1. Imports (serve, createClient)
2. CORS headers
3. Prompts por tipo de analise
4. Tool definition para JSON estruturado
5. Handler principal:
   - Validar input
   - Buscar capture com site_id
   - Gerar signed URL da imagem
   - Chamar Gemini Vision
   - Parsear resultado
   - Inserir em ai_analysis_results
   - Retornar resposta
```

### Chamada ao Gemini Vision:

```text
body: {
  model: "google/gemini-2.5-flash",
  messages: [
    { role: "system", content: systemPrompt },
    { 
      role: "user", 
      content: [
        { type: "text", text: "Analisa esta imagem." },
        { type: "image_url", image_url: { url: signedUrl } }
      ]
    }
  ],
  tools: [analysisToolDefinition],
  tool_choice: { type: "function", function: { name: "submit_analysis" } }
}
```

---

## Tool Definition (Structured Output)

```text
{
  type: "function",
  function: {
    name: "submit_analysis",
    description: "Submete os resultados da analise de imagem",
    parameters: {
      type: "object",
      properties: {
        detections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              description: { type: "string" },
              severity: { 
                type: "string", 
                enum: ["critical", "major", "minor", "observation"] 
              },
              location: { type: "string" },
              confidence: { type: "number" },
              measurements: { type: "object" }
            },
            required: ["type", "description", "severity", "location", "confidence"]
          }
        },
        overall_assessment: { type: "string" },
        recommendations: { 
          type: "array", 
          items: { type: "string" } 
        }
      },
      required: ["detections", "overall_assessment", "recommendations"]
    }
  }
}
```

---

## Insercao na Base de Dados

Para cada deteccao, inserir um registo:

```text
await supabase.from('ai_analysis_results').insert({
  capture_id: captureId,
  site_id: siteId,
  detection_type: mapDetectionType(detection.type),
  description: detection.description,
  severity: detection.severity,
  confidence: detection.confidence,
  measurements: detection.measurements || null,
  bounding_box: null, // Gemini nao retorna bounding boxes
  raw_response: fullResponse,
  ai_model: 'google/gemini-2.5-flash'
});
```

---

## Resposta ao Cliente

```json
{
  "success": true,
  "capture_id": "uuid",
  "analysis_type": "defects",
  "detections": [...],
  "overall_assessment": "...",
  "recommendations": [...],
  "results_saved": 3
}
```

---

## Error Handling

| Erro | Resposta |
|------|----------|
| capture_id em falta | 400: "capture_id is required" |
| analysis_type invalido | 400: "analysis_type must be defects, rebar, or general" |
| Capture nao encontrada | 404: "Capture not found" |
| Imagem nao encontrada no Storage | 404: "Image file not found" |
| Erro na API Gemini | 500: "AI analysis failed" |
| Rate limit (429) | 429: "Rate limit exceeded" |
| Sem creditos (402) | 402: "Insufficient credits" |

---

## Config.toml

Adicionar a nova funcao:

```toml
[functions.ai-image-analysis]
verify_jwt = false
```

---

## Fluxo de Utilizacao

```text
Cliente                     Edge Function              Supabase          Gemini Vision
   │                              │                        │                   │
   │  POST { capture_id,          │                        │                   │
   │        analysis_type }       │                        │                   │
   │─────────────────────────────>│                        │                   │
   │                              │                        │                   │
   │                              │  SELECT capture        │                   │
   │                              │  + site_id            │                   │
   │                              │───────────────────────>│                   │
   │                              │<───────────────────────│                   │
   │                              │                        │                   │
   │                              │  createSignedUrl()     │                   │
   │                              │───────────────────────>│                   │
   │                              │<───────────────────────│                   │
   │                              │                        │                   │
   │                              │  POST image + prompt  │                   │
   │                              │──────────────────────────────────────────>│
   │                              │<──────────────────────────────────────────│
   │                              │                        │                   │
   │                              │  INSERT results        │                   │
   │                              │───────────────────────>│                   │
   │                              │<───────────────────────│                   │
   │                              │                        │                   │
   │  { detections, assessment,   │                        │                   │
   │    recommendations }         │                        │                   │
   │<─────────────────────────────│                        │                   │
```

---

## Resumo das Alteracoes

1. **Criar Edge Function**: `supabase/functions/ai-image-analysis/index.ts`
   - Validar input (capture_id, analysis_type)
   - Buscar capture e site_id via joins
   - Gerar signed URL do Storage
   - Construir prompt especifico por tipo de analise
   - Usar tool calling para obter JSON estruturado
   - Inserir cada deteccao em `ai_analysis_results`
   - Retornar resultado completo ao cliente

2. **Actualizar config.toml**: Adicionar entrada `[functions.ai-image-analysis]`

---

## Consideracoes Tecnicas

1. **Modelo**: Usar `google/gemini-2.5-flash` que suporta imagens e e mais rapido
2. **Signed URLs**: Validade de 60 segundos (suficiente para o pedido)
3. **Tool Calling**: Garante resposta JSON estruturada e valida
4. **Mapeamento de tipos**: Converter tipos detectados para o enum existente
5. **Raw Response**: Guardar resposta completa para debug/auditoria
6. **Tamanho de imagem**: Gemini aceita URLs directos, nao precisa base64

