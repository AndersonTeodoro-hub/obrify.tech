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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site) => (
            <Card
              key={site.id}
              className="glass border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/app/sites/${site.id}`)}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <HardHat className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{site.name}</CardTitle>
                    <Badge variant="default" className="mt-1">
                      {t('sites.statusActive')}
                    </Badge>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass">
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
              </CardHeader>
              <CardContent>
                {site.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <MapPin className="w-4 h-4" />
                    <span className="line-clamp-1">{site.address}</span>
                  </div>
                )}
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {t('sites.description')}
                </p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    {(site as any).organizations?.name}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <HardHat className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">{t('sites.noSites')}</h3>
            <p className="text-muted-foreground text-center mt-1">{t('sites.createFirst')}</p>
            {canCreateSite && (
              <Button onClick={() => setIsCreateOpen(true)} className="mt-4">
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
