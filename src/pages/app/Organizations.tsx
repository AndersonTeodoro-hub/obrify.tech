import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Users, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { DeleteConfirmDialog } from '@/components/sites/DeleteConfirmDialog';

export default function Organizations() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDescription, setNewOrgDescription] = useState('');
  const [editingOrg, setEditingOrg] = useState<{ id: string; name: string; description?: string | null } | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);

  const { data: memberships, isLoading } = useQuery({
    queryKey: ['user-memberships', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, organizations(*)')
        .eq('user_id', user?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Real member count
  const orgIds = memberships?.map(m => m.org_id) || [];
  const { data: memberCounts } = useQuery({
    queryKey: ['member-counts', orgIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('org_id')
        .in('org_id', orgIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach(m => { counts[m.org_id] = (counts[m.org_id] || 0) + 1; });
      return counts;
    },
    enabled: orgIds.length > 0,
  });

  const createOrgMutation = useMutation({
    mutationFn: async () => {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: newOrgName, description: newOrgDescription || null } as any)
        .select()
        .single();
      if (orgError) throw orgError;
      const { error: memberError } = await supabase
        .from('memberships')
        .insert([{ org_id: org.id, user_id: user?.id!, role: 'admin' }]);
      if (memberError) throw memberError;
      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-memberships'] });
      setIsCreateOpen(false);
      setNewOrgName('');
      setNewOrgDescription('');
      toast({ title: t('common.success'), description: t('organizations.create') + ' - OK' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const editOrgMutation = useMutation({
    mutationFn: async () => {
      if (!editingOrg) return;
      const { error } = await supabase
        .from('organizations')
        .update({ name: editName, description: editDescription || null } as any)
        .eq('id', editingOrg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-memberships'] });
      setEditingOrg(null);
      toast({ title: t('common.success'), description: t('organizations.editSuccess', 'Organização actualizada') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const { error } = await supabase.from('organizations').delete().eq('id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-memberships'] });
      toast({ title: t('common.success'), description: t('common.delete') + ' - OK' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const openEditModal = (org: any) => {
    setEditingOrg(org);
    setEditName(org.name);
    setEditDescription((org as any).description || '');
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'default';
      case 'manager': return 'secondary';
      default: return 'outline';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('organizations.title')}</h1>
          <p className="text-muted-foreground">{t('organizations.subtitle')}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-gradient-to-r from-primary to-accent">
          <Plus className="w-4 h-4 mr-2" />
          {t('organizations.create')}
        </Button>
      </div>

      {memberships && memberships.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {memberships.map((membership) => (
            <Card key={membership.id} className="glass border-border/50 hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{membership.organizations?.name}</CardTitle>
                    <Badge variant={getRoleBadgeVariant(membership.role)} className="mt-1">
                      {t(`organizations.${membership.role}`)}
                    </Badge>
                  </div>
                </div>
                {membership.role === 'admin' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass">
                      <DropdownMenuItem onClick={() => openEditModal(membership.organizations)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        {t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeletingOrgId(membership.org_id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {(membership.organizations as any)?.description || t('organizations.descriptionPlaceholder')}
                </p>
                <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{memberCounts?.[membership.org_id] || 1} {t('organizations.members')}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">{t('organizations.noOrganizations')}</h3>
            <p className="text-muted-foreground text-center mt-1">{t('organizations.createFirst')}</p>
            <Button onClick={() => setIsCreateOpen(true)} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              {t('organizations.create')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Organization Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>{t('organizations.create')}</DialogTitle>
            <DialogDescription>{t('organizations.subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">{t('organizations.name')}</Label>
              <Input id="org-name" placeholder={t('organizations.namePlaceholder')} value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-description">{t('organizations.description')}</Label>
              <Textarea id="org-description" placeholder={t('organizations.descriptionPlaceholder')} value={newOrgDescription} onChange={(e) => setNewOrgDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => createOrgMutation.mutate()} disabled={!newOrgName.trim() || createOrgMutation.isPending} className="bg-gradient-to-r from-primary to-accent">
              {createOrgMutation.isPending ? t('common.loading') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Organization Dialog */}
      <Dialog open={!!editingOrg} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>{t('organizations.edit')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('organizations.name')}</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t('organizations.namePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('organizations.description')}</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder={t('organizations.descriptionPlaceholder')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrg(null)}>{t('common.cancel')}</Button>
            <Button onClick={() => editOrgMutation.mutate()} disabled={!editName.trim() || editOrgMutation.isPending}>
              {editOrgMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deletingOrgId}
        onOpenChange={(open) => !open && setDeletingOrgId(null)}
        title={t('organizations.deleteConfirmTitle', 'Eliminar organização?')}
        description={t('organizations.deleteConfirmDesc', 'Esta ação é irreversível. Todos os dados, obras e membros associados serão eliminados permanentemente.')}
        onConfirm={() => { if (deletingOrgId) { deleteOrgMutation.mutate(deletingOrgId); setDeletingOrgId(null); } }}
        isPending={deleteOrgMutation.isPending}
      />
    </div>
  );
}
