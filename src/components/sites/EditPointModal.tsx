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
  angle_sequence?: string[] | null;
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
  // Sequência de ângulos: um rótulo por linha (ex.: "Norte", "Sul", "Este", "Oeste").
  // Guardado em capture_points.angle_sequence (text[]) — usado pela captura guiada.
  const [angleSequenceText, setAngleSequenceText] = useState('');

  useEffect(() => {
    if (point) {
      setCode(point.code);
      setDescription(point.description || '');
      setPosX(point.pos_x?.toString() || '');
      setPosY(point.pos_y?.toString() || '');
      setAngleSequenceText((point.angle_sequence || []).join('\n'));
    }
  }, [point]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!point) throw new Error('No point to update');

      const angleSequence = angleSequenceText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      // angle_sequence ainda não está nos tipos gerados do Supabase (coluna nova,
      // migração manual pendente) — cast necessário até o Anderson correr o SQL e
      // regenerar os tipos.
      const { error } = await (supabase as any)
        .from('capture_points')
        .update({
          code,
          description: description || null,
          pos_x: posX ? parseFloat(posX) : null,
          pos_y: posY ? parseFloat(posY) : null,
          angle_sequence: angleSequence,
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

            <div className="grid gap-2">
              <Label htmlFor="editPointAngleSequence">Sequência de ângulos (um por linha)</Label>
              <Textarea
                id="editPointAngleSequence"
                value={angleSequenceText}
                onChange={(e) => setAngleSequenceText(e.target.value)}
                placeholder={'Norte\nSul\nEste\nOeste'}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Define a ordem de ângulos capturados automaticamente na "Sequência guiada" deste ponto. Deixe vazio se este ponto não usa sequência.
              </p>
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
