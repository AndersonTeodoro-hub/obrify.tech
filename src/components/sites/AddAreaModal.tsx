import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface AddAreaModalProps {
  floorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddAreaModal({ floorId, open, onOpenChange, onSuccess }: AddAreaModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!floorId) throw new Error('No floor selected');
      
      const { error } = await supabase
        .from('areas')
        .insert({
          floor_id: floorId,
          name,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('siteDetail.areaCreated'));
      setName('');
      onSuccess();
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !floorId) return;
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('siteDetail.addArea')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="areaName">{t('siteDetail.areaName')}</Label>
              <Input
                id="areaName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('siteDetail.areaNamePlaceholder')}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('common.loading') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
