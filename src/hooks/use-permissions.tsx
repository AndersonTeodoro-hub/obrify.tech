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

  const { data: membership, isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('memberships')
        .select('org_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache 5 minutes
  });

  const role = membership?.role || null;
  const allowedPermissions = role ? ROLE_PERMISSIONS[role] || [] : [];

  const hasPermission = (permission: string) => 
    allowedPermissions.includes(permission);

  return {
    loading: isLoading,
    role,
    orgId: membership?.org_id || null,
    
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
