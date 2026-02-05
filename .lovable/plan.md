
# Plano: Sistema de Permissoes Baseado em Roles

## Resumo
Implementar um hook `usePermissions()` que centraliza a logica de permissoes baseada nos roles existentes (admin, manager, inspector, contributor, viewer). O hook retorna flags booleanas para cada permissao, permitindo controlo de UI e validacao no frontend, complementado por RLS policies robustas no backend.

---

## Analise do Estado Actual

### Roles existentes (membership_role enum):
- admin, manager, viewer, inspector, contributor

### Funcoes de verificacao existentes:
- `is_org_member(_user_id, _org_id)` - verifica se utilizador pertence a org
- `has_org_role(_user_id, _org_id, _role)` - verifica role especifico
- `can_access_site(_user_id, _site_id)` - verifica acesso a site

### RLS Policies actuais:
- Sites: Admin/Manager podem criar/editar, apenas Admin pode eliminar
- Inspeccoes: Qualquer membro pode criar/editar
- NCs: Qualquer membro pode gerir
- Memberships: Apenas Admin pode gerir

---

## Matriz de Permissoes por Role

```text
Permissao             | Admin | Manager | Inspector | Contributor | Viewer
----------------------|-------|---------|-----------|-------------|-------
canCreateSite         |   ✓   |    ✓    |     ✗     |      ✗      |   ✗
canEditSite           |   ✓   |    ✓    |     ✗     |      ✗      |   ✗
canDeleteSite         |   ✓   |    ✗    |     ✗     |      ✗      |   ✗
canCreateInspection   |   ✓   |    ✓    |     ✓     |      ✗      |   ✗
canApproveInspection  |   ✓   |    ✓    |     ✗     |      ✗      |   ✗
canCreateNC           |   ✓   |    ✓    |     ✓     |      ✗      |   ✗
canCloseNC            |   ✓   |    ✓    |     ✗     |      ✗      |   ✗
canInviteMembers      |   ✓   |    ✗    |     ✗     |      ✗      |   ✗
canManageRoles        |   ✓   |    ✗    |     ✗     |      ✗      |   ✗
canGenerateReports    |   ✓   |    ✓    |     ✓     |      ✗      |   ✗
canExportData         |   ✓   |    ✓    |     ✗     |      ✗      |   ✗
canUploadCaptures     |   ✓   |    ✓    |     ✓     |      ✓      |   ✗
canComment            |   ✓   |    ✓    |     ✓     |      ✓      |   ✗
canViewOnly           |   ✓   |    ✓    |     ✓     |      ✓      |   ✓
```

---

## Alteracoes Necessarias

### 1. Novo Hook: usePermissions()

Criar `src/hooks/use-permissions.tsx`:

```typescript
interface Permissions {
  // Estado
  loading: boolean;
  role: string | null;
  orgId: string | null;
  
  // Sites
  canCreateSite: boolean;
  canEditSite: boolean;
  canDeleteSite: boolean;
  
  // Inspeccoes
  canCreateInspection: boolean;
  canApproveInspection: boolean;
  
  // NCs
  canCreateNC: boolean;
  canCloseNC: boolean;
  
  // Gestao
  canInviteMembers: boolean;
  canManageRoles: boolean;
  
  // Relatorios
  canGenerateReports: boolean;
  canExportData: boolean;
  
  // Capturas
  canUploadCaptures: boolean;
  canComment: boolean;
  
  // Helper
  hasRole: (role: string) => boolean;
  hasAnyRole: (...roles: string[]) => boolean;
}
```

### Logica de Mapeamento:

```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'canCreateSite', 'canEditSite', 'canDeleteSite',
    'canCreateInspection', 'canApproveInspection',
    'canCreateNC', 'canCloseNC',
    'canInviteMembers', 'canManageRoles',
    'canGenerateReports', 'canExportData',
    'canUploadCaptures', 'canComment'
  ],
  manager: [
    'canCreateSite', 'canEditSite',
    'canCreateInspection', 'canApproveInspection',
    'canCreateNC', 'canCloseNC',
    'canGenerateReports', 'canExportData',
    'canUploadCaptures', 'canComment'
  ],
  inspector: [
    'canCreateInspection',
    'canCreateNC',
    'canGenerateReports',
    'canUploadCaptures', 'canComment'
  ],
  contributor: [
    'canUploadCaptures', 'canComment'
  ],
  viewer: []
};
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/hooks/use-permissions.tsx | Criar |
| Migracao SQL | Actualizar RLS policies |
| src/pages/app/Sites.tsx | Usar permissoes |
| src/pages/app/Inspections.tsx | Usar permissoes |
| src/pages/app/NonConformities.tsx | Usar permissoes |
| src/components/settings/TeamTab.tsx | Ja usa isAdmin |
| src/i18n/locales/pt.json | Adicionar traducoes |
| src/i18n/locales/en.json | Adicionar traducoes |

---

## Implementacao do Hook

### Estrutura do usePermissions:

```text
usePermissions()
├── Buscar membership do utilizador actual
├── Calcular permissoes baseado no role
├── Retornar objecto Permissions
└── Cache com React Query para performance
```

### Codigo do Hook:

```typescript
export function usePermissions() {
  const { user } = useAuth();
  
  const { data: membership, isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('memberships')
        .select('org_id, role')
        .eq('user_id', user?.id)
        .limit(1)
        .single();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache 5 minutos
  });

  const role = membership?.role || null;
  const allowedPermissions = role ? ROLE_PERMISSIONS[role] || [] : [];

  const hasPermission = (permission: string) => 
    allowedPermissions.includes(permission);

  return {
    loading: isLoading,
    role,
    orgId: membership?.org_id || null,
    
    // Permissoes
    canCreateSite: hasPermission('canCreateSite'),
    canEditSite: hasPermission('canEditSite'),
    canDeleteSite: hasPermission('canDeleteSite'),
    canCreateInspection: hasPermission('canCreateInspection'),
    canApproveInspection: hasPermission('canApproveInspection'),
    canCreateNC: hasPermission('canCreateNC'),
    canCloseNC: hasPermission('canCloseNC'),
    canInviteMembers: hasPermission('canInviteMembers'),
    canManageRoles: hasPermission('canManageRoles'),
    canGenerateReports: hasPermission('canGenerateReports'),
    canExportData: hasPermission('canExportData'),
    canUploadCaptures: hasPermission('canUploadCaptures'),
    canComment: hasPermission('canComment'),
    
    // Helpers
    hasRole: (r: string) => role === r,
    hasAnyRole: (...roles: string[]) => roles.includes(role || ''),
  };
}
```

---

## Actualizacao de RLS Policies

### Nova funcao helper com multiplos roles:

```sql
CREATE OR REPLACE FUNCTION public.has_any_org_role(_user_id UUID, _org_id UUID, _roles membership_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id 
    AND org_id = _org_id 
    AND role = ANY(_roles)
  )
$$;
```

### Policies a actualizar:

```sql
-- Sites: Inspector/Contributor/Viewer nao podem criar
DROP POLICY IF EXISTS "Admin/Manager can create sites" ON public.sites;
CREATE POLICY "Admin/Manager can create sites" ON public.sites
  FOR INSERT WITH CHECK (
    has_any_org_role(auth.uid(), org_id, ARRAY['admin', 'manager']::membership_role[])
  );

-- Inspeccoes: Inspector pode criar, mas nao aprovar
DROP POLICY IF EXISTS "Members can update inspections" ON public.inspections;
CREATE POLICY "Members can update inspections" ON public.inspections
  FOR UPDATE USING (
    public.can_access_site(auth.uid(), site_id) AND
    (
      -- Aprovar (mudar status para completed) requer admin/manager
      (status = 'completed') = false OR
      has_any_org_role(
        auth.uid(), 
        (SELECT org_id FROM sites WHERE id = site_id),
        ARRAY['admin', 'manager']::membership_role[]
      )
    )
  );

-- NCs: Apenas admin/manager podem fechar
DROP POLICY IF EXISTS "Members can manage nonconformities" ON public.nonconformities;

CREATE POLICY "Members can view nonconformities" ON public.nonconformities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

CREATE POLICY "Inspector+ can create nonconformities" ON public.nonconformities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      JOIN public.sites s ON s.id = i.site_id
      WHERE i.id = inspection_id 
      AND has_any_org_role(auth.uid(), s.org_id, ARRAY['admin', 'manager', 'inspector']::membership_role[])
    )
  );

CREATE POLICY "Admin/Manager can close nonconformities" ON public.nonconformities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      JOIN public.sites s ON s.id = i.site_id
      WHERE i.id = inspection_id 
      AND (
        -- Qualquer membro pode editar campos gerais
        public.can_access_site(auth.uid(), i.site_id) AND
        (
          -- Mas fechar (status = closed) requer admin/manager
          status <> 'closed' OR
          has_any_org_role(auth.uid(), s.org_id, ARRAY['admin', 'manager']::membership_role[])
        )
      )
    )
  );

-- Captures: Contributor+ pode criar
DROP POLICY IF EXISTS "Members can create captures" ON public.captures;
CREATE POLICY "Contributor+ can create captures" ON public.captures
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.capture_points cp 
      JOIN public.areas a ON a.id = cp.area_id 
      JOIN public.floors f ON f.id = a.floor_id 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE cp.id = capture_point_id 
      AND has_any_org_role(auth.uid(), s.org_id, ARRAY['admin', 'manager', 'inspector', 'contributor']::membership_role[])
    )
  );
```

---

## Uso do Hook na UI

### Exemplo em Sites.tsx:

```typescript
import { usePermissions } from '@/hooks/use-permissions';

export default function Sites() {
  const { canCreateSite, canEditSite, canDeleteSite } = usePermissions();
  
  return (
    <div>
      {/* Botao de criar so aparece se tem permissao */}
      {canCreateSite && (
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('sites.create')}
        </Button>
      )}
      
      {/* Dropdown actions baseado em permissoes */}
      <DropdownMenu>
        <DropdownMenuContent>
          {canEditSite && (
            <DropdownMenuItem>
              <Pencil className="w-4 h-4 mr-2" />
              {t('common.edit')}
            </DropdownMenuItem>
          )}
          {canDeleteSite && (
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

### Exemplo em NonConformities.tsx:

```typescript
const { canCreateNC, canCloseNC } = usePermissions();

// Botao de criar NC
{canCreateNC && (
  <Button onClick={handleCreateNC}>
    {t('ncs.create')}
  </Button>
)}

// Botao de fechar NC (no detail sheet)
{canCloseNC && nc.status !== 'closed' && (
  <Button onClick={handleCloseNC}>
    {t('ncs.close')}
  </Button>
)}
```

---

## Traducoes

### Portugues (pt.json):

```json
"permissions": {
  "noPermission": "Sem permissao",
  "noPermissionDesc": "Nao tem permissao para realizar esta accao",
  "contactAdmin": "Contacte o administrador da organizacao",
  "actions": {
    "createSite": "Criar obra",
    "editSite": "Editar obra",
    "deleteSite": "Eliminar obra",
    "createInspection": "Criar inspeccao",
    "approveInspection": "Aprovar inspeccao",
    "createNC": "Criar nao conformidade",
    "closeNC": "Fechar nao conformidade",
    "inviteMembers": "Convidar membros",
    "manageRoles": "Gerir funcoes",
    "generateReports": "Gerar relatorios",
    "exportData": "Exportar dados"
  }
}
```

### Ingles (en.json):

```json
"permissions": {
  "noPermission": "No permission",
  "noPermissionDesc": "You do not have permission to perform this action",
  "contactAdmin": "Contact the organization administrator",
  "actions": {
    "createSite": "Create site",
    "editSite": "Edit site",
    "deleteSite": "Delete site",
    "createInspection": "Create inspection",
    "approveInspection": "Approve inspection",
    "createNC": "Create non-conformity",
    "closeNC": "Close non-conformity",
    "inviteMembers": "Invite members",
    "manageRoles": "Manage roles",
    "generateReports": "Generate reports",
    "exportData": "Export data"
  }
}
```

---

## Componente PermissionGate (Opcional)

Componente auxiliar para esconder/desactivar UI:

```typescript
interface PermissionGateProps {
  permission: keyof Permissions;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  mode?: 'hide' | 'disable';
}

export function PermissionGate({ 
  permission, 
  children, 
  fallback = null,
  mode = 'hide' 
}: PermissionGateProps) {
  const permissions = usePermissions();
  const hasPermission = permissions[permission];

  if (mode === 'disable') {
    return React.cloneElement(children as React.ReactElement, {
      disabled: !hasPermission,
      title: !hasPermission ? t('permissions.noPermission') : undefined
    });
  }

  return hasPermission ? <>{children}</> : <>{fallback}</>;
}

// Uso:
<PermissionGate permission="canCreateSite">
  <Button>Criar Obra</Button>
</PermissionGate>
```

---

## Fluxo de Verificacao

```text
1. Utilizador acede a pagina
       │
       ▼
2. usePermissions() busca membership
       │
       ▼
3. Calcula permissoes baseado no role
       │
       ▼
4. UI renderiza condicionalmente
   (botoes, menus, accoes)
       │
       ▼
5. Se utilizador tenta accao:
   - Frontend: Verifica permissao
   - Backend: RLS policy valida role
       │
       ▼
6. Accao permitida ou bloqueada
```

---

## Resumo das Alteracoes

1. **Criar hook usePermissions()**: Centraliza logica de permissoes
2. **Migracao SQL**: Criar funcao has_any_org_role e actualizar policies
3. **Sites.tsx**: Esconder botoes baseado em permissoes
4. **Inspections.tsx**: Condicionar criacao e aprovacao
5. **NonConformities.tsx**: Condicionar criacao e fecho
6. **TeamTab.tsx**: Ja usa isAdmin (manter)
7. **Traducoes**: Novas chaves para mensagens de permissao

---

## Consideracoes de Seguranca

1. **Frontend**: Hook apenas para UX (esconder/desactivar)
2. **Backend**: RLS policies sao a verdadeira barreira de seguranca
3. **Cache**: Permissoes cached por 5 minutos para performance
4. **Refresh**: Invalida cache quando role muda (raro)
5. **Fallback**: Se erro ao buscar role, assume viewer (minimo privilegio)

---

## Ordem de Implementacao

1. Criar funcao SQL `has_any_org_role`
2. Actualizar RLS policies existentes
3. Criar hook `usePermissions()`
4. Integrar em Sites.tsx
5. Integrar em Inspections.tsx
6. Integrar em NonConformities.tsx
7. Adicionar traducoes
8. Testar fluxo completo
