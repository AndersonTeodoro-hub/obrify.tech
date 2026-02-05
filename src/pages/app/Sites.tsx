import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, HardHat, MapPin, MoreVertical, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export default function Sites() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canCreateSite, canEditSite, canDeleteSite } = usePermissions();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [newSiteDescription, setNewSiteDescription] = useState('');

  // Get user's organizations
  const { data: memberships } = useQuery({
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

  const orgIds = memberships?.map(m => m.org_id) || [];

  // Get sites for user's organizations
  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites', orgIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('*, organizations(name)')
        .in('org_id', orgIds)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: orgIds.length > 0,
  });

  const createSiteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .insert({
          org_id: selectedOrgId,
          name: newSiteName,
          address: newSiteAddress,
          description: newSiteDescription,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setIsCreateOpen(false);
      setNewSiteName('');
      setNewSiteAddress('');
      setNewSiteDescription('');
      setSelectedOrgId('');
      toast({
        title: t('common.success'),
        description: t('sites.create') + ' - OK',
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const { error } = await supabase.from('sites').delete().eq('id', siteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast({
        title: t('common.success'),
        description: t('common.delete') + ' - OK',
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'paused':
        return 'secondary';
      case 'completed':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return t('sites.statusActive');
      case 'paused':
        return t('sites.statusPaused');
      case 'completed':
        return t('sites.statusCompleted');
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const hasOrganizations = memberships && memberships.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('sites.title')}</h1>
          <p className="text-muted-foreground">{t('sites.subtitle')}</p>
        </div>
        {canCreateSite && (
          <Button
            onClick={() => setIsCreateOpen(true)}
            disabled={!hasOrganizations}
            className="bg-gradient-to-r from-primary to-accent"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('sites.create')}
          </Button>
        )}
      </div>

      {!hasOrganizations ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <HardHat className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">{t('organizations.noOrganizations')}</h3>
            <p className="text-muted-foreground text-center mt-1">{t('organizations.createFirst')}</p>
            <Button onClick={() => navigate('/app/organizations')} className="mt-4">
              {t('organizations.create')}
            </Button>
          </CardContent>
        </Card>
      ) : sites && sites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site) => (
            <Card
              key={site.id}
              className="group overflow-hidden hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer"
              onClick={() => navigate(`/app/sites/${site.id}`)}
            >
              {/* Imagem placeholder com gradiente */}
              <div className="h-40 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                <HardHat className="w-12 h-12 text-slate-400 dark:text-slate-500 transition-transform group-hover:scale-110" />
              </div>
              
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-foreground line-clamp-1">{site.name}</h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEditSite && (
                        <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                          <Pencil className="w-4 h-4 mr-2" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                      )}
                      {canDeleteSite && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSiteMutation.mutate(site.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                {site.address && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
                    <MapPin className="w-3.5 h-3.5 inline mr-1" />
                    {site.address}
                  </p>
                )}
                
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Badge variant="default">{t('sites.statusActive')}</Badge>
                  <span className="text-xs text-slate-400">{(site as any).organizations?.name}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <HardHat className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('sites.noSites')}</h3>
            <p className="text-slate-500 max-w-md mx-auto text-center mt-2">{t('sites.createFirst')}</p>
            {canCreateSite && (
              <Button onClick={() => setIsCreateOpen(true)} className="mt-6" variant="accent">
                <Plus className="w-4 h-4 mr-2" />
                {t('sites.create')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Site Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>{t('sites.create')}</DialogTitle>
            <DialogDescription>{t('sites.subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('organizations.title')}</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  {memberships?.map((m) => (
                    <SelectItem key={m.org_id} value={m.org_id}>
                      {m.organizations?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-name">{t('sites.name')}</Label>
              <Input
                id="site-name"
                placeholder={t('sites.namePlaceholder')}
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-address">{t('sites.address')}</Label>
              <Input
                id="site-address"
                placeholder={t('sites.addressPlaceholder')}
                value={newSiteAddress}
                onChange={(e) => setNewSiteAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-description">{t('sites.description')}</Label>
              <Textarea
                id="site-description"
                placeholder={t('sites.description')}
                value={newSiteDescription}
                onChange={(e) => setNewSiteDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => createSiteMutation.mutate()}
              disabled={!selectedOrgId || !newSiteName.trim() || createSiteMutation.isPending}
              className="bg-gradient-to-r from-primary to-accent"
            >
              {createSiteMutation.isPending ? t('common.loading') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
