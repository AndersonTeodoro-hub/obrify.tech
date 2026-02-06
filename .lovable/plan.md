

# Plano: Documentos, Drones e Google OAuth

## Resumo

Implementar 3 funcionalidades: upload/download/delete de documentos da obra, modal de registo de drones com CRUD completo, e login social com Google OAuth.

---

## Migracoes de Base de Dados

A tabela `documents` existe mas faltam colunas `file_size`, `uploaded_by` e `notes`. A tabela `drones` existe mas falta `purchase_date`. Tambem precisamos de RLS no bucket `documents`.

```sql
-- Adicionar colunas em falta
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.drones ADD COLUMN IF NOT EXISTS purchase_date DATE;

-- RLS policies para bucket documents (privado - signed URLs para download)
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Authenticated users can read documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents');

CREATE POLICY "Authenticated users can delete documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents');
```

---

## 1. Upload de Documentos da Obra

### SiteDocumentsTab.tsx - Reescrever com logica completa

**Upload Modal:**
- Estado `showUploadModal` controlado pelos botoes "Carregar Documento"
- Campos: nome (input), tipo (select com 7 opcoes), ficheiro (input file, max 20MB), notas (textarea)
- Ao submeter:
  1. Upload ficheiro para bucket `documents` no path `organizations/{orgId}/sites/{siteId}/docs/{filename}`
  2. Insert na tabela `documents`: name, doc_type, file_path, file_size, org_id, site_id, uploaded_by, notes
  3. Toast sucesso + invalidate query

**Download:**
- Ao clicar download: `supabase.storage.from('documents').createSignedUrl(file_path, 3600)`
- Abre URL em nova tab

**Delete:**
- Confirmacao com AlertDialog
- Remove do storage: `supabase.storage.from('documents').remove([file_path])`
- Remove da tabela: `supabase.from('documents').delete().eq('id', docId)`
- Toast sucesso

**Lista:**
- Tabela existente + badge colorido por tipo + tamanho formatado
- Empty state ja existe

---

## 2. Modal de Registo de Drone

### Drone.tsx - Adicionar modal e CRUD

**Modal de Registo:**
- Estado `showRegisterModal`
- Campos: nome, fabricante (select: DJI/Autel/Parrot/Skydio/Outro), modelo, numero serie, data aquisicao, horas voo (default 0), estado (select), notas
- Precisa de `org_id` - buscar da membership do user
- Insert em `drones` com todos os campos
- Toast + invalidate query

**Editar Drone:**
- Estado `editingDrone` com drone seleccionado
- Mesmo modal pre-preenchido
- Update na tabela

**Eliminar Drone:**
- AlertDialog de confirmacao
- Delete da tabela

**Cards existentes:**
- Adicionar botoes editar/eliminar a cada card de drone (dropdown menu)

---

## 3. Login Social com Google

### Configuracao:
- Usar ferramenta `configure-social-auth` do Lovable Cloud para configurar Google OAuth
- Isto gera o modulo `src/integrations/lovable/` com `lovable.auth.signInWithOAuth`

### Auth.tsx - Adicionar botao Google:
- Antes do separador "ou" (ja existe), adicionar botao "Continuar com Google"
- Estilo: fundo branco, borda cinza, icone SVG do Google
- Ao clicar: `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`
- Toast de erro se falhar
- Mesmo botao no form de registo

### Perfil automatico:
- O trigger `handle_new_user` ja cria perfil automaticamente com `full_name` e `email` dos metadados - funciona nativamente com OAuth

---

## 4. Traducoes i18n

Adicionar chaves `documents.*` e `drones.*` e `auth.continueWithGoogle`, `auth.orDivider`, `auth.socialLoginError` nos 4 ficheiros de locale (pt, en, es, fr).

---

## Ficheiros a Criar

Nenhum ficheiro novo - tudo e modificacao de existentes.

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `src/components/sites/SiteDocumentsTab.tsx` | Upload modal, download signed URL, delete com confirmacao |
| `src/pages/app/Drone.tsx` | Modal registo/edicao, delete, dropdown nos cards |
| `src/pages/Auth.tsx` | Botao Google OAuth com lovable.auth |
| `src/i18n/locales/pt.json` | Chaves documents.*, drones.*, auth social |
| `src/i18n/locales/en.json` | Idem |
| `src/i18n/locales/es.json` | Idem |
| `src/i18n/locales/fr.json` | Idem |

---

## Detalhes Tecnicos

### Upload de Documentos

```text
1. User clica "Carregar Documento"
2. Modal abre com form
3. User preenche nome, tipo, seleciona ficheiro, opcionalmente notas
4. Validacao: nome obrigatorio, ficheiro obrigatorio, max 20MB
5. Upload: supabase.storage.from('documents').upload(path, file)
6. Insert: supabase.from('documents').insert({...})
7. Invalidate query 'site-documents'
8. Toast sucesso
```

### Download com Signed URL

```text
1. User clica icone download
2. supabase.storage.from('documents').createSignedUrl(file_path, 3600)
3. window.open(signedUrl, '_blank')
```

### Registo de Drone

```text
1. User clica "Registar Drone"
2. Modal com campos
3. Buscar org_id da membership do user
4. supabase.from('drones').insert({...})
5. Invalidate query 'drones'
6. Toast sucesso
```

### Google OAuth

```text
1. Configurar via configure-social-auth tool
2. Import lovable module
3. Botao chama lovable.auth.signInWithOAuth("google", { redirect_uri: origin })
4. Supabase gere redirect e callback automaticamente
5. Trigger handle_new_user cria perfil
6. onAuthStateChange detecta sessao -> redireciona para /app
```

