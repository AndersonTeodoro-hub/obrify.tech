import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

// Role-based permission mapping
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

// Capacidades do fiscal convidado (acesso por obra via site_members, sem membership de org).
// Set EXPLÍCITO — NÃO derivado de ROLE_PERMISSIONS: as flags de gestão (site CRUD,
// convidar, gerir roles) ficam sempre OFF, mesmo que site_members.role seja alto.
const SITE_FISCAL_PERMISSIONS: string[] = [
  'canCreateInspection', 'canApproveInspection',
  'canCreateNC', 'canCloseNC',
  'canGenerateReports', 'canExportData',
  'canUploadCaptures', 'canComment',
];

export interface Permissions {
  // State
  loading: boolean;
  role: string | null;
  orgId: string | null;
  
  // Sites
  canCreateSite: boolean;
  canEditSite: boolean;
  canDeleteSite: boolean;
  
  // Inspections
  canCreateInspection: boolean;
  canApproveInspection: boolean;
  
  // NCs
  canCreateNC: boolean;
  canCloseNC: boolean;
  
  // Management
  canInviteMembers: boolean;
  canManageRoles: boolean;
  
  // Reports
  canGenerateReports: boolean;
  canExportData: boolean;
  
  // Captures
  canUploadCaptures: boolean;
  canComment: boolean;
  
  // Helpers
  hasRole: (role: string) => boolean;
  hasAnyRole: (...roles: string[]) => boolean;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();

  const { data: access, isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // 1. Membership de organização (caminho atual — inalterado para membros de org).
      const { data: membership, error: mErr } = await supabase
        .from('memberships')
        .select('org_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (mErr) throw mErr;
      if (membership) {
        return { source: 'org' as const, orgId: membership.org_id, role: membership.role as string };
      }

      // 2. Fallback: SEM membership → acesso por obra (fiscal convidado via site_members).
      const { data: siteMember, error: sErr } = await supabase
        .from('site_members')
        .select('site_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!siteMember) return null;

      // orgId resolvido a partir da obra do fiscal (primeira, se houver várias).
      const { data: site, error: siteErr } = await supabase
        .from('sites')
        .select('org_id')
        .eq('id', siteMember.site_id)
        .maybeSingle();
      if (siteErr) throw siteErr;

      // role: null (NÃO o site_members.role) — evita que hasRole/hasAnyRole dê true
      // por engano num check de role de org. As flags explícitas (SITE_FISCAL) mandam.
      return { source: 'site' as const, orgId: site?.org_id ?? null, role: null };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache 5 minutes
  });

  const role = access?.role ?? null;
  // Membro de org → presets atuais. Fiscal de obra → set explícito (gestão sempre OFF).
  const allowedPermissions = !access
    ? []
    : access.source === 'site'
      ? SITE_FISCAL_PERMISSIONS
      : (ROLE_PERMISSIONS[access.role] || []);

  const hasPermission = (permission: string) => 
    allowedPermissions.includes(permission);

  return {
    loading: isLoading,
    role,
    orgId: access?.orgId ?? null,
    
    // Sites
    canCreateSite: hasPermission('canCreateSite'),
    canEditSite: hasPermission('canEditSite'),
    canDeleteSite: hasPermission('canDeleteSite'),
    
    // Inspections
    canCreateInspection: hasPermission('canCreateInspection'),
    canApproveInspection: hasPermission('canApproveInspection'),
    
    // NCs
    canCreateNC: hasPermission('canCreateNC'),
    canCloseNC: hasPermission('canCloseNC'),
    
    // Management
    canInviteMembers: hasPermission('canInviteMembers'),
    canManageRoles: hasPermission('canManageRoles'),
    
    // Reports
    canGenerateReports: hasPermission('canGenerateReports'),
    canExportData: hasPermission('canExportData'),
    
    // Captures
    canUploadCaptures: hasPermission('canUploadCaptures'),
    canComment: hasPermission('canComment'),
    
    // Helpers
    hasRole: (r: string) => role === r,
    hasAnyRole: (...roles: string[]) => roles.includes(role || ''),
  };
}
