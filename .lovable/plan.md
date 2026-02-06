
# Plano: Completar Funcionalidades com UI Existente

## Resumo

Implementar 7 funcionalidades que ja tem UI mas faltam logica: forgot password, edicao de perfil, editar organizacao, contagem real de membros, lembrar-me, upload de foto da obra, e notificacoes do agente.

---

## Migracoes de Base de Dados

Duas alteracoes de schema necessarias:

1. **Adicionar `image_url` a `sites`**: coluna TEXT nullable para foto da obra
2. **Adicionar `description` a `organizations`**: coluna TEXT nullable (ja existe no UI mas nao na tabela)
3. **Criar bucket `site-images`**: bucket publico para fotos de obras

```sql
ALTER TABLE public.sites ADD COLUMN image_url TEXT;
ALTER TABLE public.organizations ADD COLUMN description TEXT;

INSERT INTO storage.buckets (id, name, public) VALUES ('site-images', 'site-images', true);

CREATE POLICY "Authenticated users can upload site images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'site-images');

CREATE POLICY "Anyone can view site images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'site-images');

CREATE POLICY "Authenticated users can delete site images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'site-images');
```

---

## 1. Esqueci a Password

### 1.1 Modal no Auth.tsx

- Novo estado `showForgotPassword`
- O botao "Esqueceu password?" (linha 147) abre o modal
- Modal com campo email e botao "Enviar instrucoes"
- Chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
- Mostra toast sucesso/erro

### 1.2 Pagina /reset-password

Novo ficheiro `src/pages/ResetPassword.tsx`:
- Campos: nova password + confirmar password
- Ao montar, verifica se ha sessao (o link do email autentica automaticamente)
- Chama `supabase.auth.updateUser({ password })`
- Apos sucesso, redireciona para `/auth` com toast

### 1.3 Rota no App.tsx

- Adicionar `<Route path="/reset-password" element={<ResetPassword />} />`

---

## 2. Edicao de Perfil

### 2.1 Actualizar Settings.tsx

Na seccao Perfil (linhas 78-97), adicionar:
- Query para buscar dados do perfil: `supabase.from('profiles').select('*').eq('user_id', user.id).single()`
- Campo editavel: Nome completo (Input)
- Upload de avatar: botao que faz upload para bucket `captures` (ja existe) ou prefixed path
- Campo read-only: Email
- Botao "Guardar alteracoes"
- Mutation: `supabase.from('profiles').update({ full_name, avatar_url }).eq('user_id', user.id)`
- Toast sucesso/erro

### 2.2 Avatar no Header

Actualizar `AppSidebar.tsx` e `AppHeader.tsx`:
- Query ao perfil para obter `full_name` e `avatar_url`
- Mostrar avatar real no componente `Avatar` (usar `AvatarImage` do Radix)
- Fallback para iniciais do nome

---

## 3. Editar Organizacao

### 3.1 No Organizations.tsx

- Novo estado `editingOrg` (org seleccionada ou null)
- O `DropdownMenuItem` de editar (linha 168-170) define `editingOrg`
- Novo Dialog de edicao com campos Nome e Descricao pre-preenchidos
- Mutation: `supabase.from('organizations').update({ name, description }).eq('id', orgId)`
- Verificacao de permissao: so admins (ja filtrado pela condicao `membership.role === 'admin'`)
- Toast + invalidate query

---

## 4. Contagem Real de Membros

### 4.1 No Organizations.tsx

- Alterar a query de memberships para tambem buscar contagem
- Query separada ou adicional: `supabase.from('memberships').select('org_id').in('org_id', orgIds)` e contar por org_id
- Ou fazer uma query `.select('org_id, count', { count: 'exact' })` agrupada
- Abordagem mais simples: query separada com `useQuery` que faz `supabase.from('memberships').select('org_id')` e conta no cliente
- Mostrar no card: "X membros" em vez de texto estatico (linha 188-190)

---

## 5. Lembrar-me

### 5.1 No Auth.tsx

- Novo estado `rememberMe` (boolean)
- `useEffect` ao montar: le `localStorage.getItem('obrify_remember_email')`, se existir preenche `loginEmail` e marca checkbox
- Conectar o `Checkbox` (linha 144) ao estado `rememberMe`
- No `handleLogin` com sucesso: se `rememberMe` guarda email, senao remove
- Nao requer backend

---

## 6. Upload de Foto da Obra

### 6.1 No Sites.tsx (criar obra)

- Adicionar campo de upload de imagem no Dialog de criacao (antes do DialogFooter)
- Preview da imagem seleccionada
- Ao criar: upload para `site-images/{orgId}/{siteId}/{filename}`, obter URL publica
- Guardar `image_url` na insercao do site

### 6.2 No EditSiteModal.tsx

- Adicionar campo de upload/preview similar
- Ao guardar: upload + update `image_url`

### 6.3 No card da obra (Sites.tsx)

- Substituir o placeholder gradient (linhas 217-220) por imagem real se `site.image_url` existir
- Fallback para o placeholder com HardHat actual

---

## 7. Notificacoes do Agente

### 7.1 No ObrifyAgent.tsx

- Ao abrir o painel (`handleOpen`), fazer 2 queries:
  - NCs criticas abertas ha mais de 7 dias: `supabase.from('nonconformities').select('id').eq('severity', 'critical').eq('status', 'open').lt('created_at', 7diasAtras)`
  - Conflitos criticos nao confirmados: `supabase.from('project_conflicts').select('id').eq('severity', 'critical').eq('status', 'pending')`
- Se houver resultados, prefixar a mensagem de greeting com alertas formatados
- Badge no botao flutuante: dot vermelho se houver alertas (verificar periodicamente ou ao montar)

---

## 8. Traducoes i18n

Adicionar as seguintes chaves nos 4 ficheiros de locale:

**auth.forgotPassword**: title, description, submit, success, backToLogin
**auth.resetPassword**: title, newPassword, confirmPassword, submit, success
**settings.profile**: title, name, email, avatar, uploadAvatar, save, saved
**organizations.edit**: title, save, success (renomear/adicionar)
**sites.uploadImage, sites.imageUploaded**

---

## Ficheiros a Criar

| Ficheiro | Descricao |
|----------|-----------|
| `src/pages/ResetPassword.tsx` | Pagina para redefinir password |

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `src/App.tsx` | +1 rota /reset-password |
| `src/pages/Auth.tsx` | Modal forgot password, lembrar-me, checkbox funcional |
| `src/pages/app/Settings.tsx` | Edicao de perfil com nome, avatar, guardar |
| `src/pages/app/Organizations.tsx` | Modal editar org, contagem membros, mutation editar |
| `src/pages/app/Sites.tsx` | Upload foto ao criar, mostrar foto no card |
| `src/components/sites/EditSiteModal.tsx` | Campo upload foto ao editar |
| `src/components/layout/AppSidebar.tsx` | Avatar real do perfil |
| `src/components/layout/AppHeader.tsx` | Avatar real no header (se aplicavel) |
| `src/components/ai/ObrifyAgent.tsx` | Alertas proactivos ao abrir, badge no FAB |
| `src/i18n/locales/pt.json` | Novas chaves traducao |
| `src/i18n/locales/en.json` | Novas chaves traducao |
| `src/i18n/locales/es.json` | Novas chaves traducao |
| `src/i18n/locales/fr.json` | Novas chaves traducao |

---

## Detalhes Tecnicos

### Reset Password Flow

```text
1. User clica "Esqueceu password?"
2. Modal abre com campo email
3. supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })
4. User recebe email com link
5. Link redireciona para /reset-password (Supabase injeta sessao automaticamente)
6. User preenche nova password
7. supabase.auth.updateUser({ password })
8. Redireciona para /auth com toast sucesso
```

### Upload de Avatar

```text
1. User seleciona ficheiro
2. Upload para bucket captures: avatars/{userId}/{filename}
3. Obter URL publica com getPublicUrl
4. Update profiles.avatar_url
5. Invalidar query do perfil
```

### Contagem de Membros

```text
- Query: supabase.from('memberships').select('org_id')
- Agrupar no cliente: reduce por org_id para obter Map<orgId, count>
- Mostrar count no card
```

### Alertas do Agente

```text
- Ao abrir: 2 queries paralelas (NCs + conflitos)
- Se alertas > 0: mensagem formatada como greeting
- Badge: useQuery com refetchInterval de 60s para manter badge actualizado
- Dot vermelho no FAB com numero de alertas
```
