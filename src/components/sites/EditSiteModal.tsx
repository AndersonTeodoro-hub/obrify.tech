import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Upload } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface EditSiteModalProps {
  site: {
    id: string;
    name: string;
    address: string | null;
    status: string;
    org_id?: string;
    image_url?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditSiteModal({ site, open, onOpenChange, onSuccess }: EditSiteModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(site.name);
  const [address, setAddress] = useState(site.address || '');
  const [status, setStatus] = useState(site.status);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>((site as any).image_url || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      let imageUrl = (site as any).image_url || null;

      if (imageFile) {
        const filePath = `sites/${site.org_id || 'unknown'}/${site.id}/${Date.now()}-${imageFile.name}`;
        const { error: uploadError } = await supabase.storage.from('site-images').upload(filePath, imageFile);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('site-images').getPublicUrl(filePath);
          imageUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase
        .from('sites')
        .update({ name, address: address || null, status, image_url: imageUrl } as any)
        .eq('id', site.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('siteDetail.siteUpdated'));
      onSuccess();
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('siteDetail.editSite')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t('sites.name')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('sites.namePlaceholder')} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">{t('sites.address')}</Label>
              <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('sites.addressPlaceholder')} rows={2} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="status">{t('sites.status')}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('sites.statusActive')}</SelectItem>
                  <SelectItem value="paused">{t('sites.statusPaused')}</SelectItem>
                  <SelectItem value="completed">{t('sites.statusCompleted')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Image upload */}
            <div className="grid gap-2">
              <Label>{t('sites.uploadImage', 'Foto da obra')}</Label>
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
                  <Button type="button" variant="destructive" size="sm" className="absolute top-2 right-2" onClick={() => { setImageFile(null); setImagePreview(null); }}>✕</Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />{t('sites.uploadImage', 'Foto da obra')}
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
