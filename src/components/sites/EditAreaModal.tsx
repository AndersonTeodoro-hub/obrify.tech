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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const AREA_TYPES = ['room', 'corridor', 'bathroom', 'kitchen', 'balcony', 'other'] as const;
type AreaType = typeof AREA_TYPES[number];

interface Area {
  id: string;
  name: string;
  type?: string | null;
}

interface EditAreaModalProps {
  area: Area | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditAreaModal({ area, open, onOpenChange, onSuccess }: EditAreaModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<AreaType>('other');

  useEffect(() => {
    if (area) {
      setName(area.name);
      setType((area.type as AreaType) || 'other');
    }
  }, [area]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!area) throw new Error('No area to update');
      
      const { error } = await supabase
        .from('areas')
        .update({
          name,
          type,
        })
        .eq('id', area.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('siteDetail.areaUpdated'));
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
          <DialogTitle>{t('siteDetail.editArea')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="editAreaName">{t('siteDetail.areaName')}</Label>
              <Input
                id="editAreaName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('siteDetail.areaNamePlaceholder')}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="editAreaType">{t('siteDetail.areaType')}</Label>
              <Select value={type} onValueChange={(value: AreaType) => setType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AREA_TYPES.map((areaType) => (
                    <SelectItem key={areaType} value={areaType}>
                      {t(`siteDetail.areaTypes.${areaType}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
