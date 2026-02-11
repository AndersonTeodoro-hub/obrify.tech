
# IncompatiCheck -- Parte 2: Componente Principal Completo

## Resumo

Substituir o placeholder `export default function IncompatiCheck()` (linhas 420-437) pelo componente completo com:
- Painel de chat com "Eng. Marcos IA" (respostas mock baseadas em keywords)
- Reconhecimento de voz (Web Speech API)
- Lista de incompatibilidades com filtros por severidade
- Secao transversal SVG interactiva
- Upload e partilha integrados
- Barra lateral de projectos
- Comandos rapidos de chat
- Layout 4 colunas (sidebar projetos + main + agent panel)

## Nota sobre o codigo colado

O JSX da Parte 2 tem o mesmo problema de formatacao da Parte 1 -- tags HTML/JSX foram removidas durante a colagem (aparecem textos soltos em vez de `<div>`, `<button>`, etc.). Vou reconstruir o JSX completo mantendo exactamente a mesma logica, estrutura e visual descritos no codigo.

## Alteracoes

### 1. Ficheiro `src/pages/app/IncompatiCheck.tsx`

**Actualizar import** (linha 1): adicionar `useEffect`, `useCallback` que faltam.

**Substituir o placeholder** (linhas 420-437) pelo componente completo que inclui:

- `generateAgentResponse(query)` -- funcao que devolve respostas tecnicas baseadas em keywords (cotas, colisoes, relatorio, terraplanagem, normas, materiais, partilha)
- `renderMarkdown(text)` -- converte `**bold**` e `\n` para HTML
- `formatFileSize(bytes)` -- formata tamanho de ficheiro
- `IncompatiCheck` (default export) -- componente principal com:
  - Estado: projects, filter, chatMessages, chatInput, isRecording, voiceStatus, showUpload, showShare, isAnalyzing
  - Layout: header + 3 paineis (sidebar projectos, main com stats/SVG/lista, agent chat)
  - Chat: mensagens com markdown, input texto, comandos rapidos
  - Voz: Web Speech API (pt-PT) com visualizacao de ondas
  - Filtros: all/critical/warning/info
  - Analise: botao "Executar Analise" com loading state
  - CSS animations inline (pulse-ring, wave)

### Ficheiros modificados

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Substituir placeholder pelo componente completo da Parte 2 |

---

## Detalhes Tecnicos

### Estrutura do componente principal

```text
IncompatiCheck (default export)
+-- Header (logo + upload + share buttons)
+-- Sidebar (project list + upload drop zone)
+-- Main Panel
|   +-- Stats (4x StatCard)
|   +-- CrossSectionSVG
|   +-- Incompatibility list (filtered)
+-- Agent Panel
    +-- Agent avatar + credentials
    +-- Chat messages (markdown rendered)
    +-- Voice toggle (SpeechRecognition)
    +-- Text input
    +-- Quick commands
```

### Funcoes auxiliares adicionadas

- `generateAgentResponse`: switch por keywords, devolve texto markdown tecnico
- `renderMarkdown`: regex simples para bold + line breaks
- `formatFileSize`: bytes para KB/MB

### Estado do componente

- `projects`: lista de projectos (inicia com MOCK_PROJECTS)
- `filter`: "all" | "critical" | "warning" | "info"
- `chatMessages`: array de ChatMessage
- `chatInput`: string do input
- `isRecording` / `voiceStatus`: estado do reconhecimento de voz
- `showUpload` / `showShare`: modais
- `isAnalyzing`: loading state da analise
