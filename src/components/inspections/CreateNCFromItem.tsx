import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CreateNCFromItemProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  inspectionItemId: string;
  itemTitle: string;
  onSuccess: () => void;
}

const severityOptions = [
  { value: 'low', labelKey: 'captures.viewer.severityLow' },
  { value: 'medium', labelKey: 'captures.viewer.severityMedium' },
  { value: 'high', labelKey: 'captures.viewer.severityHigh' },
  { value: 'critical', labelKey: 'captures.viewer.severityCritical' },
];

export function CreateNCFromItem({
  open,
  onOpenChange,
  inspectionId,
  inspectionItemId,
  itemTitle,
  onSuccess,
}: CreateNCFromItemProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(`NC - ${itemTitle}`);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [responsible, setResponsible] = useState('');
  const [dueDate, setDueDate] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('nonconformities')
        .insert({
          inspection_id: inspectionId,
          inspection_item_id: inspectionItemId,
          title,
          description: description || null,
          severity,
          corrective_action: correctiveAction || null,
          responsible: responsible || null,
          due_date: dueDate || null,
          status: 'OPEN',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nonconformities', inspectionId] });
      toast({
        title: t('inspections.detail.ncCreated'),
      });
      onSuccess();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setCorrectiveAction('');
    setResponsible('');
    setDueDate('');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    } else {
      setTitle(`NC - ${itemTitle}`);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            {t('inspections.detail.createNC')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nc-title">{t('inspections.detail.ncTitle')}</Label>
            <Input
              id="nc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('captures.viewer.ncTitlePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nc-description">{t('inspections.detail.ncDescription')}</Label>
            <Textarea
              id="nc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('captures.viewer.ncDescriptionPlaceholder')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('inspections.detail.ncSeverity')}</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {severityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nc-corrective">{t('inspections.detail.ncCorrectiveAction')}</Label>
            <Textarea
              id="nc-corrective"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder={t('inspections.detail.ncCorrectiveActionPlaceholder')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nc-responsible">{t('inspections.detail.ncResponsible')}</Label>
              <Input
                id="nc-responsible"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                placeholder={t('inspections.detail.ncResponsiblePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nc-due-date">{t('inspections.detail.ncDueDate')}</Label>
              <Input
                id="nc-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!title || createMutation.isPending}
            className="bg-red-500 hover:bg-red-600"
          >
            {createMutation.isPending ? t('common.loading') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
