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

interface AddFloorModalProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddFloorModal({ siteId, open, onOpenChange, onSuccess }: AddFloorModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('floors')
        .insert({
          site_id: siteId,
          name,
          level: level ? parseInt(level, 10) : null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('siteDetail.floorCreated'));
      setName('');
      setLevel('');
      onSuccess();
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('siteDetail.addFloor')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="floorName">{t('siteDetail.floorName')}</Label>
              <Input
                id="floorName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('siteDetail.floorNamePlaceholder')}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="floorLevel">{t('siteDetail.floorLevel')}</Label>
              <Input
                id="floorLevel"
                type="number"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="0"
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
