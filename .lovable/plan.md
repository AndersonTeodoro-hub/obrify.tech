
# Plano: Historico e Organizacao de Ficheiros do Obrify Agent

## Resumo

Adicionar persistencia de conversas na base de dados, log de accoes, organizacao automatica de ficheiros por pastas, e uma tab de historico no painel do agente.

---

## 1. Migracao de Base de Dados

Criar 4 novas tabelas:

### agent_conversations
- `id` UUID PK
- `organization_id` UUID FK -> organizations
- `user_id` UUID (auth.uid)
- `started_at` TIMESTAMPTZ DEFAULT now()
- `ended_at` TIMESTAMPTZ nullable
- `title` TEXT nullable
- `message_count` INTEGER DEFAULT 0

### agent_messages
- `id` UUID PK
- `conversation_id` UUID FK -> agent_conversations
- `role` TEXT ('user' | 'agent')
- `content` TEXT
- `tools_used` JSONB DEFAULT '[]'
- `context` JSONB DEFAULT '{}'
- `created_at` TIMESTAMPTZ DEFAULT now()

### agent_actions_log
- `id` UUID PK
- `conversation_id` UUID FK -> agent_conversations
- `message_id` UUID FK -> agent_messages (nullable)
- `tool_name` TEXT
- `params` JSONB DEFAULT '{}'
- `result` JSONB DEFAULT '{}'
- `success` BOOLEAN DEFAULT true
- `created_at` TIMESTAMPTZ DEFAULT now()

### file_organization
- `id` UUID PK
- `organization_id` UUID FK -> organizations
- `site_id` UUID nullable
- `file_path` TEXT
- `file_type` TEXT (capture, inspection, nc_evidence, report, project)
- `original_name` TEXT
- `generated_by` TEXT ('user' | 'agent')
- `related_entity_id` UUID nullable
- `tags` TEXT[] DEFAULT '{}'
- `created_at` TIMESTAMPTZ DEFAULT now()

### RLS Policies
- agent_conversations: SELECT/INSERT/UPDATE onde o user pertence a organizacao via `is_org_member(auth.uid(), organization_id)`
- agent_messages: SELECT/INSERT via join com agent_conversations do proprio user
- agent_actions_log: SELECT/INSERT via join com agent_conversations
- file_organization: SELECT para membros da org, INSERT/UPDATE para admin/manager

### Trigger
- Trigger em agent_messages para incrementar `message_count` em agent_conversations automaticamente

---

## 2. Funcoes Helper de Ficheiros

Criar funcao SQL `get_file_path` que gera caminhos padronizados:

```text
organizations/{orgId}/sites/{siteId}/captures/{YYYY}-{MM}/
organizations/{orgId}/sites/{siteId}/inspections/{YYYY}-{MM}/
organizations/{orgId}/sites/{siteId}/nonconformities/{status}/
organizations/{orgId}/sites/{siteId}/reports/{type}/
```

---

## 3. Actualizar Edge Function `ai-obrify-agent`

Modificacoes:
- Receber `conversationId` e `userId` no body
- Guardar cada mensagem (user + agent) na tabela `agent_messages`
- Registar cada accao executada em `agent_actions_log`
- Adicionar 3 novas tools:
  - `LIST_FILES`: consulta `file_organization` por siteId/type/folder
  - `SAVE_REPORT`: placeholder que regista na `file_organization` e retorna path
  - `ORGANIZE_FILES`: consulta e lista ficheiros por criterios
- Actualizar o enum de tools no tool calling do modelo

---

## 4. Actualizar Componente ObrifyAgent

### Gestao de Conversas
- Ao abrir, verificar se existe conversa activa (ultima conversa com `ended_at` NULL e `started_at` nos ultimos 30 min)
- Se nao, criar nova conversa via Supabase
- Guardar `conversationId` em state
- Enviar `conversationId` e `userId` em cada pedido ao edge function

### Tab Historico
- Adicionar tabs no painel: "Chat" | "Historico"
- Tab Historico: lista de conversas anteriores com titulo e data
- Ao clicar numa conversa, carrega as mensagens dessa conversa
- Titulo da conversa gerado automaticamente (primeira mensagem do user truncada a 50 chars)

### Limpar conversa
- Botao "Limpar" agora marca `ended_at` na conversa actual e cria uma nova

### Usar useAuth
- Importar `useAuth` para obter `user.id` e passar ao edge function
- Obter `organization_id` do user via query a memberships

---

## 5. Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| `supabase/migrations/..._agent_history.sql` | Criar - Tabelas + RLS + triggers |
| `supabase/functions/ai-obrify-agent/index.ts` | Modificar - Persistencia + novas tools |
| `src/components/ai/ObrifyAgent.tsx` | Modificar - Conversas BD + tab historico |

---

## Detalhes Tecnicos

### Fluxo de Conversa

```text
1. User abre painel
2. Verifica conversa activa (< 30 min inactividade)
3. Se nao existe -> cria nova agent_conversation
4. User envia mensagem
5. Frontend envia { message, context, conversationId, userId }
6. Edge function:
   a. Insere user message em agent_messages
   b. Processa com IA
   c. Executa tools e regista em agent_actions_log
   d. Insere agent message em agent_messages
   e. Retorna resposta
7. Frontend actualiza UI
```

### Tab Historico - UI

```text
[Chat]  [Historico]
-------------------------
| 05 Fev - "Ver NCs..."  |
| 04 Fev - "Resumo..."   |
| 03 Fev - "Relatorio..." |
-------------------------
```

Ao clicar numa conversa anterior:
- Carrega mensagens dessa conversa
- Mostra em modo leitura (sem input, ou com input para continuar)

### Organizacao de Ficheiros

A tabela `file_organization` serve como indice/catalogo. Os ficheiros fisicos continuam nos buckets existentes (captures, documents). A tabela regista metadados e o caminho padronizado para consulta rapida pelo agente.
