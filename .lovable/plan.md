
# Plano: Sistema Obrify Agent Completo

## Resumo

Criar um agente inteligente acessivel em todas as paginas da aplicacao, com botao flutuante, painel lateral de chat, execucao de accoes (navegacao, queries), sugestoes rapidas e historico persistido em localStorage.

---

## Ficheiros a Criar

### 1. Edge Function `supabase/functions/ai-obrify-agent/index.ts`

Nova edge function que:
- Recebe `{ message, context: { page, siteId, filters } }`
- Usa tool calling do Lovable AI Gateway (Gemini) para extrair JSON estruturado
- Define tools: QUERY_SITES, QUERY_CAPTURES, QUERY_NONCONFORMITIES, QUERY_STATS, NAVIGATE, GENERATE_REPORT
- Executa as tools internamente (queries ao Supabase com service role key)
- Retorna JSON com `{ thought, actions, response, suggestions }`
- Nao usa streaming (retorna resposta completa via `supabase.functions.invoke`)
- Trata erros 429/402

### 2. Componente `src/components/ai/ObrifyAgent.tsx`

Componente completo com:

**Botao Flutuante:**
- `fixed bottom-6 right-6`, circulo 56px
- Gradiente accent-500 a 600, icone Sparkles
- Badge de notificacao animado na primeira visita

**Painel (Sheet lado direito):**
- 420px desktop, fullscreen mobile
- Header: "Obrify Agent" + botao fechar
- Area de chat scrollavel
- Mensagens user: direita, fundo primary
- Mensagens agent: esquerda, fundo slate, suporte markdown (react-markdown nao esta instalado, usaremos whitespace-pre-wrap com formatacao basica)
- Sugestoes rapidas como botoes clicaveis
- Input de texto + botao enviar + botao microfone (desactivado)
- Indicador "A pensar..." com animacao

**Mensagem inicial:**
"Ola! Sou o Obrify, o teu assistente de fiscalizacao. Posso ajudar-te a consultar obras, ver nao-conformidades, gerar relatorios e muito mais. O que precisas?"

**Sugestoes rapidas:**
- "Ver NCs abertas"
- "Resumo das obras"
- "Gerar relatorio"

### 3. Modificar `src/components/layout/AppLayout.tsx`

Adicionar o componente `<ObrifyAgent />` ao layout para estar disponivel em todas as paginas.

### 4. Atualizar `supabase/config.toml`

Adicionar configuracao para a nova edge function com `verify_jwt = false`.

---

## Detalhes Tecnicos

### Edge Function - Tool Calling

A edge function usa tool calling do Lovable AI para obter respostas estruturadas:

```text
tools = [
  {
    name: "obrify_response",
    parameters: {
      thought: string,
      actions: [{ tool: string, params: object }],
      response: string,
      suggestions: string[]
    }
  }
]
tool_choice = { type: "function", function: { name: "obrify_response" } }
```

Dentro da funcao, apos receber as actions do modelo, executa queries reais:

```text
QUERY_SITES -> supabase.from('sites').select(...)
QUERY_CAPTURES -> supabase.from('captures').select(...)
QUERY_NONCONFORMITIES -> supabase.from('nonconformities').select(...)
QUERY_STATS -> queries agregadas com count
NAVIGATE -> retorna path no response
GENERATE_REPORT -> placeholder (retorna instrucao)
```

O fluxo e:
1. Recebe mensagem + contexto
2. Envia ao modelo com system prompt + tools
3. Modelo decide que tool usar
4. Edge function executa a query real
5. Envia resultado de volta ao modelo para formatar resposta
6. Retorna JSON final ao cliente

### Componente - Contexto Automatico

```text
- useLocation() -> detecta pagina actual
- useParams() -> extrai siteId se na rota /app/sites/:siteId
- Envia { page: pathname, siteId, filters: {} } em cada pedido
```

### Componente - Execucao de Accoes

Quando o agente retorna actions com tool "NAVIGATE":
- Usa `useNavigate()` para navegar automaticamente
- Mostra toast a informar a navegacao

### Historico

- State `messages[]` em useState
- Persist em `localStorage` key `obrify_agent_history`
- Carrega ao montar, guarda a cada nova mensagem
- Limpa ao fazer logout (o componente esta dentro de ProtectedRoute)

---

## Dependencias

Nenhuma nova dependencia necessaria. Usa Sheet existente do shadcn/ui.
