
# Plano: Relatorio de Compatibilizacao e Polish Final

## Resumo

Adicionar geracao de PDF de compatibilizacao, comandos rapidos contextuais no agente, atalhos de teclado funcionais, polish visual (skeletons, animacoes, empty states), e traducoes do agente para os 4 idiomas.

---

## 1. Relatorio de Compatibilizacao (PDF)

### 1.1 Funcao no pdfGenerator.ts

Nova funcao `generateCompatibilizationReport` em `src/services/pdfGenerator.ts`:

Parametros: `{ siteId, includeResolved?, includeImages? }`

Seccoes do PDF:
- **Capa**: Logo, "RELATORIO DE COMPATIBILIZACAO", nome da obra, data
- **Sumario Executivo**: total conflitos, breakdown por severidade (tabela com cores), taxa de resolucao
- **Projectos Analisados**: tabela com nome, especialidade, versao, data de upload, estado de analise
- **Conflitos**: lista ordenada por severidade, cada um com badge de severidade, tipo, titulo, descricao, localizacao, recomendacao, estado
- **Checklist de Verificacoes Padrao**: lista fixa de verificacoes tipicas (sobreposicoes, cotas, provisoes, normas)
- **Recomendacoes**: geradas automaticamente com base nos conflitos (ex: "Rever coordenacao entre Estruturas e Aguas")
- **Assinatura**

Dados necessarios: queries a `projects`, `project_conflicts`, `project_elements` e `sites`.

### 1.2 Modal de Opcoes

Novo componente `src/components/sites/GenerateCompatReportModal.tsx`:
- Checkbox "Incluir conflitos resolvidos"
- Checkbox "Incluir imagens das plantas"
- Botao "Gerar Relatorio" com loading state
- Chama `generateCompatibilizationReport` e faz download + persiste no bucket `documents` e tabela `documents`

### 1.3 Botao na UI

Adicionar botao "Gerar Relatorio" no `ProjectConflictsDetail.tsx` (header da seccao de conflitos) e tambem na vista geral de projectos em `SiteProjectsTab.tsx`.

---

## 2. Comandos Rapidos Contextuais

### 2.1 Logica no ObrifyAgent.tsx

Substituir as sugestoes estaticas do `INITIAL_MESSAGE` por sugestoes dinamicas baseadas em `location.pathname`:

| Pagina (pathname) | Sugestoes |
|---|---|
| `/app/dashboard` | "Resumo do dia", "NCs urgentes", "Actividade recente" |
| `/app/sites/:siteId` | "Resumo desta obra", "NCs abertas aqui", "Gerar relatorio", "Conflitos de projectos" |
| `/app/nonconformities` | "Filtrar criticas", "Exportar lista", "NCs mais antigas" |
| `/app/sites/:siteId` (tab projectos) | "Analisar pendentes", "Ver conflitos", "Gerar relatorio compatibilizacao" |
| Default | "Ver NCs abertas", "Resumo das obras", "Gerar relatorio" |

Implementar como funcao `getContextualSuggestions(pathname)` que retorna array de strings.

---

## 3. Atalhos de Teclado

### 3.1 Hook useKeyboardShortcuts

Novo hook `src/hooks/use-keyboard-shortcuts.tsx` com `useEffect` que escuta `keydown`:

| Atalho | Accao |
|---|---|
| `Ctrl+K` / `Cmd+K` | Abre o Obrify Agent |
| `Escape` | Fecha painel do agente (se aberto) |
| `Ctrl+Enter` | Envia mensagem (dentro do agente) |

### 3.2 Integracao

- O hook e usado no `AppLayout.tsx` para os atalhos globais
- O `ObrifyAgent` expoe `open/setOpen` via callback props ou ref para o layout controlar
- Actualizar `KeyboardShortcutsModal` com os novos atalhos
- `Ctrl+Enter` e tratado directamente no `ObrifyAgent` no `onKeyDown` do input

---

## 4. Polish Visual

### 4.1 ObrifyAgent

- **Loading com skeleton**: Substituir os 3 pontos animados por um skeleton de 2-3 linhas (usando o Skeleton existente) para parecer uma mensagem a carregar
- **Animacao slide-in**: O SheetContent ja tem animacao do Radix; adicionar `animate-fade-in` nas mensagens individuais com delay incremental
- **Empty state no historico**: Na `AgentHistoryTab`, quando sem conversas, mostrar icone + texto elegante ("Ainda sem conversas. Comeca a falar com o Obrify!")
- **Feedback visual**: Toast apos toggle de voz on/off e toggle de modo especialista

### 4.2 ProjectConflictsDetail

- Skeleton loading enquanto dados carregam
- Empty state quando nao ha conflitos: icone CheckCircle2 verde + "Sem incompatibilidades detectadas"
- Animacao `animate-fade-in` nos cards de conflito com staggered delay

### 4.3 SiteProjectsTab

- Animacao staggered nos cards de especialidade (ja usa grid, adicionar delay por indice)

---

## 5. Traducoes do Agente

### 5.1 Novas chaves i18n

Adicionar seccao `agent` nos 4 ficheiros de locale (`pt.json`, `en.json`, `es.json`, `fr.json`):

```text
agent.greeting - Mensagem de boas-vindas
agent.thinking - "A pensar..." / "Thinking..."
agent.error - "Ocorreu um erro..."
agent.tooManyRequests - "Demasiados pedidos..."
agent.creditsExhausted - "Creditos esgotados"
agent.clear - "Limpar"
agent.recording - "A ouvir..."
agent.inputPlaceholder - "Escreve a tua pergunta..."
agent.speaking - "A falar..."
agent.voiceOn - "Voz ligada"
agent.voiceOff - "Voz desligada"
agent.expertMode - "Modo Eng. Silva"
agent.backToCurrent - "Voltar a conversa actual"
agent.navigation - "Navegacao"
agent.navigatingTo - "A navegar para {{path}}"
agent.historyEmpty - "Ainda sem conversas"
agent.historyEmptyDesc - "Comeca a falar com o Obrify!"
agent.suggestions.openNCs - "Ver NCs abertas"
agent.suggestions.siteSummary - "Resumo das obras"
agent.suggestions.generateReport - "Gerar relatorio"
agent.suggestions.daySummary - "Resumo do dia"
agent.suggestions.urgentNCs - "NCs urgentes"
agent.suggestions.recentActivity - "Actividade recente"
agent.suggestions.siteOverview - "Resumo desta obra"
agent.suggestions.siteNCs - "NCs abertas aqui"
agent.suggestions.projectConflicts - "Conflitos de projectos"
agent.suggestions.filterCritical - "Filtrar criticas"
agent.suggestions.exportList - "Exportar lista"
agent.suggestions.analyzePending - "Analisar pendentes"
agent.suggestions.viewConflicts - "Ver conflitos"
```

### 5.2 Actualizar ObrifyAgent

- Substituir todos os textos hardcoded por `t('agent.xxx')`
- A mensagem inicial (greeting) usa `t('agent.greeting')`
- As sugestoes contextuais usam as chaves `t('agent.suggestions.xxx')`
- O agente envia o idioma actual no body para `ai-obrify-agent` para que o modelo responda no idioma certo

### 5.3 Actualizar ai-obrify-agent

- Receber campo `language` no body (default: 'pt')
- Adicionar ao system prompt: "Responde SEMPRE no idioma: {{language}}"

---

## 6. Ficheiros a Criar

| Ficheiro | Descricao |
|---|---|
| `src/components/sites/GenerateCompatReportModal.tsx` | Modal com opcoes para gerar relatorio |
| `src/hooks/use-keyboard-shortcuts.tsx` | Hook para atalhos globais |

## 7. Ficheiros a Modificar

| Ficheiro | Alteracao |
|---|---|
| `src/services/pdfGenerator.ts` | Nova funcao `generateCompatibilizationReport` |
| `src/components/ai/ObrifyAgent.tsx` | Sugestoes contextuais, traducoes, Ctrl+Enter, polish visual |
| `src/components/ai/AgentHistoryTab.tsx` | Empty state elegante |
| `src/components/sites/ProjectConflictsDetail.tsx` | Botao "Gerar Relatorio", skeleton, empty state, animacoes |
| `src/components/sites/SiteProjectsTab.tsx` | Botao relatorio, animacoes staggered nos cards |
| `src/components/layout/AppLayout.tsx` | Integrar useKeyboardShortcuts |
| `src/components/onboarding/KeyboardShortcutsModal.tsx` | Adicionar novos atalhos |
| `supabase/functions/ai-obrify-agent/index.ts` | Receber `language`, adicionar ao prompt |
| `src/i18n/locales/pt.json` | Seccao `agent` |
| `src/i18n/locales/en.json` | Seccao `agent` |
| `src/i18n/locales/es.json` | Seccao `agent` |
| `src/i18n/locales/fr.json` | Seccao `agent` |

---

## Detalhes Tecnicos

### Geracao do Relatorio de Compatibilizacao

A funcao faz queries directas ao Supabase (como os outros geradores):

```text
1. Query sites (nome, morada)
2. Query projects WHERE site_id (nome, specialty, version, analysis_status)
3. Query project_conflicts WHERE site_id (+ opcionalmente resolvidos)
4. Gera PDF com jsPDF + autoTable
5. Upload blob para bucket documents em /org/site/reports/
6. INSERT em tabela documents (name, type, file_path, site_id, org_id)
7. Retorna blob para download
```

### Atalhos de Teclado - Comunicacao com ObrifyAgent

O `AppLayout` precisa de controlar o estado `open` do `ObrifyAgent`. Opcoes:
- Usar um estado elevado no `AppLayout` e passar `open/onOpenChange` como props ao `ObrifyAgent`
- Manter simples e funcional

Abordagem escolhida: elevar estado `open` para `AppLayout` e passar como props.

### Sugestoes Contextuais

```text
function getContextualSuggestions(pathname: string, t: TFunction): string[] {
  if (pathname === '/app/dashboard') return [t('agent.suggestions.daySummary'), ...];
  if (pathname.includes('/app/sites/') && pathname.includes('siteId')) return [...];
  if (pathname === '/app/nonconformities') return [...];
  return [t('agent.suggestions.openNCs'), ...]; // default
}
```
