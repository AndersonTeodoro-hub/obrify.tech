
# Plano: Sistema de Convite de Membros para Organizacao

## Resumo
Implementar sistema completo de convites para membros, incluindo nova tab "Equipa" nas Settings, listagem de membros, modal de convite com seleccao de role e obras, tabela de convites pendentes, e pagina de aceitacao de convite.

---

## Analise do Estado Actual

### Tabela memberships:
- Role como enum: admin, manager, viewer
- Precisa adicionar: inspector, contributor

### Tabela profiles:
- Tem: full_name, email, avatar_url, user_id
- Pode ser usada para mostrar nomes dos membros

### Settings.tsx:
- Pagina simples com cards
- Precisa de adicionar sistema de tabs para incluir "Equipa"

---

## Alteracoes de Base de Dados

### 1. Expandir enum membership_role

```sql
ALTER TYPE public.membership_role ADD VALUE 'inspector';
ALTER TYPE public.membership_role ADD VALUE 'contributor';
```

### 2. Nova tabela: invitations

```sql
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  site_ids uuid[] DEFAULT '{}',
  invited_by uuid NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

-- Indice unico para token
CREATE UNIQUE INDEX invitations_token_idx ON public.invitations(token);

-- Indice para email + org (evitar duplicados)
CREATE UNIQUE INDEX invitations_email_org_pending_idx 
  ON public.invitations(email, org_id) 
  WHERE status = 'pending';
```

### 3. RLS Policies para invitations

```sql
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins podem ver e gerir convites da sua org
CREATE POLICY "Admins can manage invitations" ON public.invitations
  FOR ALL USING (has_org_role(auth.uid(), org_id, 'admin'));

-- Utilizadores podem ver convites pelo token (para aceitar)
CREATE POLICY "Anyone can view invitation by token" ON public.invitations
  FOR SELECT USING (true);
```

---

## Novos Componentes

### 1. TeamTab.tsx (src/components/settings/TeamTab.tsx)

Tab principal com lista de membros e botao de convite:

```text
TeamTab.tsx
├── Header: "Equipa" + Botao "Convidar Membro"
├── Tabela de Membros:
│   ├── Avatar + Nome
│   ├── Email
│   ├── Role (Badge colorido)
│   ├── Data de entrada
│   ├── Accoes (Editar role, Remover)
├── Seccao "Convites Pendentes":
│   ├── Email
│   ├── Role
│   ├── Enviado por
│   ├── Expira em
│   ├── Accoes (Reenviar, Cancelar)
```

### 2. InviteMemberModal.tsx (src/components/settings/InviteMemberModal.tsx)

Modal para criar convite:

```text
InviteMemberModal.tsx
├── Campo: Email do convidado
├── Select: Role
│   ├── Admin (acesso total)
│   ├── Manager (gestao de obras)
│   ├── Inspector (realizar inspeccoes)
│   ├── Contributor (adicionar capturas)
│   └── Viewer (apenas visualizar)
├── Multi-select: Obras (visivel para roles nao-admin)
│   └── Lista de sites da organizacao
├── Botoes: Cancelar / Enviar Convite
```

### 3. AcceptInvite.tsx (src/pages/AcceptInvite.tsx)

Pagina publica para aceitar convites:

```text
AcceptInvite.tsx
├── Validar token da URL
├── Se token valido e nao expirado:
│   ├── Mostrar: Org name, Role
│   ├── Se utilizador logado:
│   │   └── Botao "Aceitar Convite"
│   ├── Se nao logado:
│   │   ├── Form de Login
│   │   └── Link "Criar Conta"
├── Se token invalido/expirado:
│   └── Mensagem de erro
```

---

## Modificar Settings.tsx

Transformar em layout com tabs:

```text
Settings.tsx (modificado)
├── Tabs:
│   ├── "Geral" (conteudo actual)
│   └── "Equipa" (novo TeamTab)
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| Migracao SQL | Expandir enum + criar tabela invitations |
| src/components/settings/TeamTab.tsx | Criar |
| src/components/settings/InviteMemberModal.tsx | Criar |
| src/pages/AcceptInvite.tsx | Criar |
| src/pages/app/Settings.tsx | Modificar (adicionar tabs) |
| src/App.tsx | Adicionar rota /invite/:token |
| src/i18n/locales/pt.json | Adicionar traducoes |
| src/i18n/locales/en.json | Adicionar traducoes |

---

## Logica do TeamTab

### Query de membros:

```typescript
const { data: members } = await supabase
  .from('memberships')
  .select(`
    id,
    role,
    created_at,
    user_id,
    profiles!inner(
      full_name,
      email,
      avatar_url
    )
  `)
  .eq('org_id', currentOrgId);
```

### Query de convites pendentes:

```typescript
const { data: invitations } = await supabase
  .from('invitations')
  .select('*')
  .eq('org_id', currentOrgId)
  .eq('status', 'pending')
  .order('created_at', { ascending: false });
```

---

## Logica do InviteMemberModal

### Criar convite:

```typescript
const createInvite = async () => {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      org_id: currentOrgId,
      email: inviteEmail,
      role: selectedRole,
      site_ids: selectedSites,
      invited_by: user.id,
    })
    .select()
    .single();

  if (!error) {
    // Gerar link: /invite/{token}
    const inviteLink = `${window.location.origin}/invite/${data.token}`;
    // Copiar para clipboard ou mostrar
  }
};
```

---

## Logica do AcceptInvite

### Fluxo de aceitacao:

```typescript
// 1. Buscar convite pelo token
const { data: invitation } = await supabase
  .from('invitations')
  .select('*, organizations(name)')
  .eq('token', token)
  .eq('status', 'pending')
  .single();

// 2. Verificar se nao expirou
if (new Date(invitation.expires_at) < new Date()) {
  // Convite expirado
  await supabase
    .from('invitations')
    .update({ status: 'expired' })
    .eq('id', invitation.id);
  return;
}

// 3. Aceitar convite (se utilizador logado)
const acceptInvite = async () => {
  // Criar membership
  await supabase.from('memberships').insert({
    org_id: invitation.org_id,
    user_id: user.id,
    role: invitation.role,
  });

  // Marcar convite como aceite
  await supabase
    .from('invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  // Redirigir para dashboard
  navigate('/app');
};
```

---

## Estrutura Visual do TeamTab

```text
┌─────────────────────────────────────────────────────────────────┐
│  Equipa                                    [+ Convidar Membro]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MEMBROS (3)                                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 👤 Joao Silva       joao@email.com    Admin    12 Jan 25  │  │
│  │ 👤 Maria Santos     maria@email.com   Manager  15 Jan 25  │  │
│  │ 👤 Pedro Costa      pedro@email.com   Viewer   20 Jan 25  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  CONVITES PENDENTES (1)                                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ana@email.com   Inspector   Expira: 5 dias  [📋][❌]      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estrutura Visual do InviteMemberModal

```text
┌─────────────────────────────────────────────────┐
│  Convidar Membro                          [X]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  Email *                                        │
│  ┌─────────────────────────────────────────┐    │
│  │ email@exemplo.com                       │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Funcao *                                       │
│  ┌─────────────────────────────────────────┐    │
│  │ Inspector                           ▼   │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Obras com Acesso (para roles nao-admin)        │
│  ┌─────────────────────────────────────────┐    │
│  │ ☑ Edificio Centro                       │    │
│  │ ☐ Obra Norte                            │    │
│  │ ☑ Projeto Sul                           │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
├─────────────────────────────────────────────────┤
│           [Cancelar]    [Enviar Convite]        │
└─────────────────────────────────────────────────┘
```

---

## Traducoes

### Portugues (pt.json):

```json
"team": {
  "title": "Equipa",
  "subtitle": "Gerir membros da organizacao",
  "members": "Membros",
  "pendingInvites": "Convites Pendentes",
  "inviteMember": "Convidar Membro",
  "noMembers": "Sem membros",
  "noInvites": "Sem convites pendentes",
  "email": "Email",
  "role": "Funcao",
  "joinedAt": "Entrou em",
  "expiresIn": "Expira em",
  "days": "dias",
  "copyLink": "Copiar Link",
  "cancelInvite": "Cancelar Convite",
  "resendInvite": "Reenviar",
  "removeFromOrg": "Remover da Organizacao",
  "changeRole": "Alterar Funcao",
  "sites": "Obras com Acesso",
  "allSites": "Todas as obras",
  "selectSites": "Seleccionar obras",
  "inviteSent": "Convite enviado!",
  "inviteLink": "Link de convite",
  "roles": {
    "admin": "Administrador",
    "manager": "Gestor",
    "inspector": "Fiscalizador",
    "contributor": "Colaborador",
    "viewer": "Visualizador"
  },
  "roleDescriptions": {
    "admin": "Acesso total, gerir membros e configuracoes",
    "manager": "Gerir obras, inspeccoes e equipas",
    "inspector": "Realizar inspeccoes e criar NCs",
    "contributor": "Adicionar capturas e comentarios",
    "viewer": "Apenas visualizar informacoes"
  }
}
```

### Ingles (en.json):

```json
"team": {
  "title": "Team",
  "subtitle": "Manage organization members",
  "members": "Members",
  "pendingInvites": "Pending Invitations",
  "inviteMember": "Invite Member",
  "noMembers": "No members",
  "noInvites": "No pending invitations",
  "email": "Email",
  "role": "Role",
  "joinedAt": "Joined",
  "expiresIn": "Expires in",
  "days": "days",
  "copyLink": "Copy Link",
  "cancelInvite": "Cancel Invitation",
  "resendInvite": "Resend",
  "removeFromOrg": "Remove from Organization",
  "changeRole": "Change Role",
  "sites": "Site Access",
  "allSites": "All sites",
  "selectSites": "Select sites",
  "inviteSent": "Invitation sent!",
  "inviteLink": "Invitation link",
  "roles": {
    "admin": "Administrator",
    "manager": "Manager",
    "inspector": "Inspector",
    "contributor": "Contributor",
    "viewer": "Viewer"
  },
  "roleDescriptions": {
    "admin": "Full access, manage members and settings",
    "manager": "Manage sites, inspections and teams",
    "inspector": "Perform inspections and create NCs",
    "contributor": "Add captures and comments",
    "viewer": "View only"
  }
}
```

---

## Rota AcceptInvite

Adicionar ao App.tsx:

```tsx
import AcceptInvite from './pages/AcceptInvite';

// Na configuracao de rotas (fora do ProtectedRoute)
<Route path="/invite/:token" element={<AcceptInvite />} />
```

---

## Fluxo de Convite

```text
1. Admin clica "Convidar Membro"
       │
       ▼
2. Preenche email, role, e obras (se aplicavel)
       │
       ▼
3. Sistema cria entrada em invitations com token unico
       │
       ▼
4. Mostra link de convite (copiar para partilhar)
       │
       ▼
5. Convidado acede ao link /invite/{token}
       │
       ▼
6. Se ja tem conta: faz login e aceita
   Se nao tem: cria conta e aceita
       │
       ▼
7. Membership criada, convite marcado como aceite
       │
       ▼
8. Utilizador redirigido para dashboard
```

---

## Consideracoes Tecnicas

1. **Novos Roles**: Adicionar "inspector" e "contributor" ao enum membership_role
2. **Token Seguro**: UUID aleatorio para cada convite
3. **Expiracao**: Convites expiram apos 7 dias por defeito
4. **Duplicados**: Indice unico impede convites duplicados pendentes
5. **Email Opcional**: Como email nao esta configurado, mostrar apenas o link
6. **Site Access**: Campo site_ids permite restricao de acesso por obra (futuro)

---

## Resumo das Alteracoes

1. **Migracao SQL**: Expandir enum + criar tabela invitations com RLS
2. **TeamTab.tsx**: Lista de membros e convites pendentes
3. **InviteMemberModal.tsx**: Formulario de convite
4. **AcceptInvite.tsx**: Pagina publica para aceitar convites
5. **Settings.tsx**: Adicionar sistema de tabs
6. **App.tsx**: Adicionar rota /invite/:token
7. **Traducoes**: Novas chaves para PT e EN
