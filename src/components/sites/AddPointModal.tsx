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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface AddPointModalProps {
  areaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddPointModal({ areaId, open, onOpenChange, onSuccess }: AddPointModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!areaId) throw new Error('No area selected');
      
      const { error } = await supabase
        .from('capture_points')
        .insert({
          area_id: areaId,
          code,
          description: description || null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('siteDetail.pointCreated'));
      setCode('');
      setDescription('');
      onSuccess();
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !areaId) return;
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('siteDetail.addPoint')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="pointCode">{t('siteDetail.pointCode')}</Label>
              <Input
                id="pointCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="P-001"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pointDescription">{t('siteDetail.pointDescription')}</Label>
              <Textarea
                id="pointDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('siteDetail.pointDescriptionPlaceholder')}
                rows={2}
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
