

# Plano: Knowledge Híbrido no IncompatiCheck

## Resumo

Usar resumos já processados da Base de Conhecimento como texto leve em vez de PDFs completos na análise de incompatibilidades. PDFs só são enviados para projetos sem knowledge. Isto reduz payloads de ~5MB/PDF para ~2KB/texto.

## Alterações

### 1. Edge Function `incompaticheck-analyze/index.ts`

- Aceitar novo campo `knowledge_data` no request body (opcional)
- Separar projetos em 2 grupos: com knowledge (enviar como texto) e sem knowledge (download + PDF base64 como antes)
- Para projetos com knowledge, construir content block de texto com resumo + elementos-chave em vez de document block PDF
- Ajustar estratégia: recalcular `totalMB` apenas com projetos PDF reais; se knowledge reduz payload abaixo de 80MB, usar "all_at_once"
- Resposta inclui novo campo `knowledge_used: number` para indicar quantos projetos usaram knowledge
- Fallback total: se `knowledge_data` não vier, comportamento idêntico ao actual

### 2. Edge Function `incompaticheck-analyze-proposal/index.ts`

- Aceitar `knowledge_data` no request body
- Para `original_projects`, usar knowledge como texto quando disponível em vez de download + PDF base64
- Mesma lógica de separação: com knowledge → texto, sem knowledge → PDF

### 3. Frontend `IncompatiCheck.tsx` — `handleRunAnalysis`

- Antes de invocar a edge function, query `eng_silva_project_knowledge` filtrado por `obra_id` + `processed = true`
- Mapear para `knowledge_data` array e passar no body da invocação
- Adicionar lógica para mostrar toast informativo quando knowledge é usado ("Usando resumos inteligentes para X projetos")

### 4. Frontend `IncompatiCheck.tsx` — Badge 🧠 nos projetos

- Ao selecionar obra (ou quando projetos carregam), fazer query cruzada a `eng_silva_project_knowledge` para obter nomes de documentos processados
- Guardar num `Set<string>` no estado
- Na lista de projetos (linha ~462-483), mostrar badge "🧠 Knowledge" ao lado dos projetos cujo nome existe no set
- Nota: o user_id do knowledge pode ser diferente do user_id da obra — a query precisa de filtrar por `user_id` do utilizador autenticado

### 5. Frontend `IncompatiCheck.tsx` — Dica para processar

- Quando `ic.projects.length > 4` e poucos/nenhum têm knowledge, mostrar alerta com link para `/app/project-knowledge`:
  "💡 Processe os projetos no Conhecimento do Projeto para análises mais rápidas e de melhor qualidade."

### 6. Hook `useIncompaticheck.ts`

- Adicionar estado `knowledgeNames: Set<string>` 
- Ao `selectObra`, fazer query a `eng_silva_project_knowledge` para popular o set
- Expor `knowledgeNames` para o componente usar no badge

## Ficheiros modificados

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/incompaticheck-analyze/index.ts` | Aceitar `knowledge_data`, usar texto vs PDF |
| `supabase/functions/incompaticheck-analyze-proposal/index.ts` | Mesma melhoria para original_projects |
| `src/pages/app/IncompatiCheck.tsx` | Query knowledge, badge 🧠, dica, toast |
| `src/pages/app/incompaticheck/useIncompaticheck.ts` | Estado `knowledgeNames`, query no selectObra |

## Garantias

- Se não houver knowledge processado, tudo funciona exactamente como antes (PDFs base64)
- Nenhuma tabela nova, nenhuma migration
- Deploy das 2 edge functions após edição

