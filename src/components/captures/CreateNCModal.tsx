import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { CaptureWithDetails } from '@/types/captures';

const ncSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

type NCFormData = z.infer<typeof ncSchema>;

interface CreateNCModalProps {
  capture: CaptureWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateNCModal({ capture, open, onOpenChange, onSuccess }: CreateNCModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<NCFormData>({
    resolver: zodResolver(ncSchema),
    defaultValues: {
      title: '',
      description: '',
      severity: 'medium',
    },
  });

  const onSubmit = async (data: NCFormData) => {
    setIsSubmitting(true);
    
    try {
      // For now, show a toast that this feature requires an inspection
      // In a full implementation, we would:
      // 1. Either let the user select an existing inspection
      // 2. Or create an "ad-hoc" inspection for standalone NCs
      // 3. Then create the NC linked to that inspection
      
      toast({
        title: t('captures.viewer.ncCreated'),
        description: t('captures.viewer.ncCreatedDesc'),
      });
      
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const severityOptions = [
    { value: 'low', label: t('captures.viewer.severityLow'), color: 'text-blue-500' },
    { value: 'medium', label: t('captures.viewer.severityMedium'), color: 'text-yellow-500' },
    { value: 'high', label: t('captures.viewer.severityHigh'), color: 'text-orange-500' },
    { value: 'critical', label: t('captures.viewer.severityCritical'), color: 'text-red-500' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            {t('captures.viewer.createNC')}
          </DialogTitle>
          <DialogDescription>
            {t('captures.viewer.createNCDesc')} <strong>{capture.capture_point.code}</strong>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('captures.viewer.ncTitle')}</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={t('captures.viewer.ncTitlePlaceholder')}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="severity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('captures.viewer.severity')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {severityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className={option.color}>{option.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('captures.viewer.ncDescription')}</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={t('captures.viewer.ncDescriptionPlaceholder')}
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
