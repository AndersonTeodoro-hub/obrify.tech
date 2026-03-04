import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, HardHat, MapPin, MoreVertical, Pencil, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DeleteConfirmDialog } from '@/components/sites/DeleteConfirmDialog';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EditSiteModal } from '@/components/sites/EditSiteModal';

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
  const [newSiteImage, setNewSiteImage] = useState<File | null>(null);
  const [newSiteImagePreview, setNewSiteImagePreview] = useState<string | null>(null);
  const [editingSite, setEditingSite] = useState<any>(null);
  const [deletingSiteId, setDeletingSiteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: memberships } = useQuery({
    queryKey: ['user-memberships', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('memberships').select('*, organizations(*)').eq('user_id', user?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const orgIds = memberships?.map(m => m.org_id) || [];

  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites', orgIds],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*, organizations(name)').in('org_id', orgIds).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: orgIds.length > 0,
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewSiteImage(file);
      setNewSiteImagePreview(URL.createObjectURL(file));
    }
  };

  const createSiteMutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;

      // Create site first to get ID
      const { data, error } = await supabase
        .from('sites')
        .insert({ org_id: selectedOrgId, name: newSiteName, address: newSiteAddress, description: newSiteDescription, status: 'active' })
        .select()
        .single();
      if (error) throw error;

      // Upload image if selected
      if (newSiteImage) {
        const filePath = `sites/${selectedOrgId}/${data.id}/${Date.now()}-${newSiteImage.name}`;
        const { error: uploadError } = await supabase.storage.from('site-images').upload(filePath, newSiteImage);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('site-images').getPublicUrl(filePath);
          imageUrl = urlData.publicUrl;
          await supabase.from('sites').update({ image_url: imageUrl }).eq('id', data.id);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setIsCreateOpen(false);
      setNewSiteName(''); setNewSiteAddress(''); setNewSiteDescription(''); setSelectedOrgId('');
      setNewSiteImage(null); setNewSiteImagePreview(null);
      toast({ title: t('common.success'), description: t('sites.create') + ' - OK' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const { error } = await supabase.from('sites').delete().eq('id', siteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast({ title: t('common.success'), description: t('common.delete') + ' - OK' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return t('sites.statusActive');
      case 'paused': return t('sites.statusPaused');
      case 'completed': return t('sites.statusCompleted');
      default: return status;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
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
          <Button onClick={() => setIsCreateOpen(true)} disabled={!hasOrganizations} className="bg-gradient-to-r from-primary to-accent">
            <Plus className="w-4 h-4 mr-2" />{t('sites.create')}
          </Button>
        )}
      </div>

      {!hasOrganizations ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <HardHat className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">{t('organizations.noOrganizations')}</h3>
            <p className="text-muted-foreground text-center mt-1">{t('organizations.createFirst')}</p>
            <Button onClick={() => navigate('/app/organizations')} className="mt-4">{t('organizations.create')}</Button>
          </CardContent>
        </Card>
      ) : sites && sites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site) => (
            <Card key={site.id} className="group overflow-hidden hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer" onClick={() => navigate(`/app/sites/${site.id}`)}>
              {/* Image or placeholder */}
              <div className="h-40 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center overflow-hidden">
                {(site as any).image_url ? (
                  <img src={(site as any).image_url} alt={site.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                ) : (
                  <HardHat className="w-12 h-12 text-slate-400 dark:text-slate-500 transition-transform group-hover:scale-110" />
                )}
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-foreground line-clamp-1">{site.name}</h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2"><MoreVertical className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEditSite && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingSite(site); }}>
                          <Pencil className="w-4 h-4 mr-2" />{t('common.edit')}
                        </DropdownMenuItem>
                      )}
                      {canDeleteSite && (
                        <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingSiteId(site.id); }}>
                          <Trash2 className="w-4 h-4 mr-2" />{t('common.delete')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {site.address && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
                    <MapPin className="w-3.5 h-3.5 inline mr-1" />{site.address}
                  </p>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Badge variant="default">{getStatusLabel(site.status)}</Badge>
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
                <Plus className="w-4 h-4 mr-2" />{t('sites.create')}
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
                <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                <SelectContent>
                  {memberships?.map((m) => (
                    <SelectItem key={m.org_id} value={m.org_id}>{m.organizations?.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-name">{t('sites.name')}</Label>
              <Input id="site-name" placeholder={t('sites.namePlaceholder')} value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-address">{t('sites.address')}</Label>
              <Input id="site-address" placeholder={t('sites.addressPlaceholder')} value={newSiteAddress} onChange={(e) => setNewSiteAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-description">{t('sites.description')}</Label>
              <Textarea id="site-description" placeholder={t('sites.description')} value={newSiteDescription} onChange={(e) => setNewSiteDescription(e.target.value)} />
            </div>
            {/* Image upload */}
            <div className="space-y-2">
              <Label>{t('sites.uploadImage', 'Foto da obra')}</Label>
              {newSiteImagePreview ? (
                <div className="relative">
                  <img src={newSiteImagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
                  <Button variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => { setNewSiteImage(null); setNewSiteImagePreview(null); }}>✕</Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />{t('sites.uploadImage', 'Foto da obra')}
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => createSiteMutation.mutate()} disabled={!selectedOrgId || !newSiteName.trim() || createSiteMutation.isPending} className="bg-gradient-to-r from-primary to-accent">
              {createSiteMutation.isPending ? t('common.loading') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Site Modal */}
      {editingSite && (
        <EditSiteModal
          site={editingSite}
          open={!!editingSite}
          onOpenChange={(open) => !open && setEditingSite(null)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['sites'] }); setEditingSite(null); }}
        />
      )}

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deletingSiteId}
        onOpenChange={(open) => !open && setDeletingSiteId(null)}
        title={t('sites.deleteConfirmTitle', 'Eliminar obra?')}
        description={t('sites.deleteConfirmDesc', 'Esta ação é irreversível. Todos os dados associados a esta obra serão eliminados permanentemente.')}
        onConfirm={() => { if (deletingSiteId) { deleteSiteMutation.mutate(deletingSiteId); setDeletingSiteId(null); } }}
        isPending={deleteSiteMutation.isPending}
      />
    </div>
  );
}
