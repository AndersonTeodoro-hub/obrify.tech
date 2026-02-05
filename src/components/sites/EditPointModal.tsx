import { useState, useEffect } from 'react';
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

interface CapturePoint {
  id: string;
  code: string;
  description: string | null;
  pos_x?: number | null;
  pos_y?: number | null;
}

interface EditPointModalProps {
  point: CapturePoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditPointModal({ point, open, onOpenChange, onSuccess }: EditPointModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [posX, setPosX] = useState('');
  const [posY, setPosY] = useState('');

  useEffect(() => {
    if (point) {
      setCode(point.code);
      setDescription(point.description || '');
      setPosX(point.pos_x?.toString() || '');
      setPosY(point.pos_y?.toString() || '');
    }
  }, [point]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!point) throw new Error('No point to update');
      
      const { error } = await supabase
        .from('capture_points')
        .update({
          code,
          description: description || null,
          pos_x: posX ? parseFloat(posX) : null,
          pos_y: posY ? parseFloat(posY) : null,
        })
        .eq('id', point.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('siteDetail.pointUpdated'));
      onSuccess();
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('siteDetail.editPoint')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="editPointCode">{t('siteDetail.pointCode')}</Label>
              <Input
                id="editPointCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="P-001"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="editPointDescription">{t('siteDetail.pointDescription')}</Label>
              <Textarea
                id="editPointDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('siteDetail.pointDescriptionPlaceholder')}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="editPointPosX">{t('siteDetail.pointPosX')}</Label>
                <Input
                  id="editPointPosX"
                  type="number"
                  step="0.01"
                  value={posX}
                  onChange={(e) => setPosX(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="editPointPosY">{t('siteDetail.pointPosY')}</Label>
                <Input
                  id="editPointPosY"
                  type="number"
                  step="0.01"
                  value={posY}
                  onChange={(e) => setPosY(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('siteDetail.pointPosHint')}</p>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
