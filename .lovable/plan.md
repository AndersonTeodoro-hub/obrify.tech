
# Plano: Analise por IA dos Projectos

## Resumo

Criar duas edge functions para analise e comparacao de plantas tecnicas via Gemini Vision, uma UI de gestao de conflitos, novos tools no agente, e analise automatica apos upload.

---

## 1. Edge Function: ai-analyze-project

**Ficheiro:** `supabase/functions/ai-analyze-project/index.ts`

Recebe `{ projectId, analysisType: "full" | "quick" }`.

Fluxo:
1. Busca projecto na tabela `projects` (nome, specialty, file_url, file_type)
2. Gera signed URL do ficheiro no bucket `documents`
3. Actualiza `analysis_status` para `analyzing`
4. Envia imagem/PDF para Gemini Vision (`google/gemini-2.5-flash`) com prompt especializado por tipo de planta:
   - Detecta elementos estruturais, arquitectura, aguas, electricidade, AVAC
   - Para cada elemento: tipo, codigo, localizacao, propriedades, confianca
   - Retorna metadados (escala, titulo) e observacoes
5. Usa tool calling para output JSON estruturado
6. Insere elementos detectados na tabela `project_elements`
7. Actualiza `analysis_status` para `completed` e `analyzed_at` para now()
8. Em caso de erro, marca `analysis_status` como `failed`

**Nota sobre PDFs:** Gemini Vision suporta PDFs directamente via URL, nao e necessario converter para imagem.

---

## 2. Edge Function: ai-compare-projects

**Ficheiro:** `supabase/functions/ai-compare-projects/index.ts`

Recebe `{ project1Id, project2Id }`.

Fluxo:
1. Busca ambos projectos e gera signed URLs
2. Envia ambas plantas para Gemini Vision com prompt de comparacao:
   - Detecta: spatial_overlap, dimension_mismatch, missing_provision, code_violation
   - Para cada conflito: tipo, severidade, titulo, descricao, localizacao, confianca
   - Retorna avaliacao de compatibilidade e verificacoes OK
3. Usa tool calling para output estruturado
4. Insere conflitos na tabela `project_conflicts`
5. Se ha conflitos criticos, cria alertas para membros da organizacao

---

## 3. Actualizar config.toml

Adicionar as duas novas funcoes:

```text
[functions.ai-analyze-project]
verify_jwt = false

[functions.ai-compare-projects]
verify_jwt = false
```

---

## 4. Actualizar SiteProjectsTab

Adicionar botao "Analisar" nas accoes de cada projecto na tabela, que chama a edge function `ai-analyze-project` e mostra progresso via badge de status.

Adicionar botao "Comparar" que abre modal para seleccionar segundo projecto e chama `ai-compare-projects`.

---

## 5. Actualizar ProjectViewer

Adicionar botao "Analisar" no header do viewer que dispara analise e refresca elementos no painel lateral.

---

## 6. Seccao de Conflitos na Tab de Projectos

Expandir `ProjectConflictsSummary` com lista detalhada de conflitos:

Cada conflito mostra:
- Severidade (badge colorido), titulo, especialidades envolvidas
- Localizacao, estado, confianca IA
- Botoes: Confirmar, Descartar, Criar NC

Workflow de estados: detected -> confirmed -> resolved | dismissed | nc_created

Botao "Criar NC" insere na tabela `nonconformities` com dados do conflito e actualiza `project_conflicts.related_nc_id` e status para `nc_created`.

---

## 7. Tools do Agente

Adicionar ao `ai-obrify-agent/index.ts`:

| Tool | Descricao |
|------|-----------|
| QUERY_PROJECTS | Consulta projectos por siteId, specialty, status analise |
| ANALYZE_PROJECT | Chama ai-analyze-project |
| COMPARE_PROJECTS | Chama ai-compare-projects |
| QUERY_CONFLICTS | Consulta conflitos por siteId, severity, status |
| CREATE_NC_FROM_CONFLICT | Cria NC a partir de conflito |

Actualizar o enum de tools no tool calling do modelo.

---

## 8. Analise Automatica pos-Upload

No `UploadProjectModal`, apos upload com sucesso:
- Chamar `ai-analyze-project` em background (sem bloquear UI)
- Apos analise completa, comparar automaticamente com projectos de especialidades relacionadas no mesmo site:
  - Estruturas compara com: Arquitectura, Aguas, AVAC, Electricidade
  - Arquitectura compara com: Estruturas
  - Aguas compara com: Estruturas, Electricidade
- Toast a informar que analise foi iniciada

---

## 9. Ficheiros a Criar

| Ficheiro | Descricao |
|----------|-----------|
| `supabase/functions/ai-analyze-project/index.ts` | Edge function de analise de planta |
| `supabase/functions/ai-compare-projects/index.ts` | Edge function de comparacao |
| `src/components/sites/ProjectConflictsDetail.tsx` | Lista detalhada de conflitos com accoes |
| `src/components/sites/CompareProjectsModal.tsx` | Modal para seleccionar projecto a comparar |

## 10. Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `supabase/config.toml` | Adicionar 2 novas funcoes |
| `supabase/functions/ai-obrify-agent/index.ts` | Adicionar 5 novas tools |
| `src/components/sites/SiteProjectsTab.tsx` | Botoes Analisar e Comparar nas accoes |
| `src/components/sites/ProjectViewer.tsx` | Botao Analisar no header |
| `src/components/sites/UploadProjectModal.tsx` | Analise automatica pos-upload |
| `src/components/sites/ProjectConflictsSummary.tsx` | Expandir com lista detalhada ou link |

---

## Detalhes Tecnicos

### Prompt de Analise (ai-analyze-project)

O prompt e adaptado pela especialidade do projecto. Exemplo para arquitectura detecta paredes, portas, janelas, escadas. Para estruturas detecta pilares, vigas, lajes, paredes estruturais. O output e forcado via tool calling com schema:

```text
{
  metadata: { escala, titulo, notas },
  elementos: [{ tipo, codigo, localizacao, propriedades, confianca }],
  observacoes: []
}
```

### Prompt de Comparacao (ai-compare-projects)

Envia duas imagens ao Gemini com contexto das especialidades. Output forcado via tool calling:

```text
{
  compatibilidade: "boa" | "moderada" | "problematica",
  resumo: string,
  conflitos: [{ tipo, severidade, titulo, descricao, localizacao, confianca }],
  verificacoes_ok: [string]
}
```

### Fluxo de Criacao de NC a partir de Conflito

```text
1. User clica "Criar NC" num conflito
2. INSERT em nonconformities com:
   - title: conflito.title
   - description: conflito.description
   - severity: mapeamento (critical->critical, high->major, etc.)
   - site_id: conflito.site_id
   - status: open
3. UPDATE project_conflicts SET status = 'nc_created', related_nc_id = nc.id
4. Toast de sucesso com link para NC
```

### Mapeamento de Especialidades para Comparacao Automatica

```text
structure -> [architecture, plumbing, hvac, electrical]
architecture -> [structure]
plumbing -> [structure, electrical]
electrical -> [structure, plumbing]
hvac -> [structure]
gas -> [structure]
telecom -> [structure, electrical]
```
