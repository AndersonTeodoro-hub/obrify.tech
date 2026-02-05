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

interface Floor {
  id: string;
  name: string;
  level: number | null;
  description?: string | null;
}

interface EditFloorModalProps {
  floor: Floor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditFloorModal({ floor, open, onOpenChange, onSuccess }: EditFloorModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (floor) {
      setName(floor.name);
      setLevel(floor.level?.toString() || '');
      setDescription(floor.description || '');
    }
  }, [floor]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!floor) throw new Error('No floor to update');
      
      const { error } = await supabase
        .from('floors')
        .update({
          name,
          level: level ? parseInt(level, 10) : null,
          description: description || null,
        })
        .eq('id', floor.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('siteDetail.floorUpdated'));
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
          <DialogTitle>{t('siteDetail.editFloor')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="editFloorName">{t('siteDetail.floorName')}</Label>
              <Input
                id="editFloorName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('siteDetail.floorNamePlaceholder')}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="editFloorLevel">{t('siteDetail.floorLevel')}</Label>
              <Input
                id="editFloorLevel"
                type="number"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="editFloorDescription">{t('siteDetail.floorDescription')}</Label>
              <Textarea
                id="editFloorDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('siteDetail.floorDescriptionPlaceholder')}
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
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
