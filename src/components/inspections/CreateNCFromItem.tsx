import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera, X, Calendar as CalendarIcon, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface CreateNCFromItemProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  inspectionItemId: string;
  siteId: string;
  itemTitle: string;
  onSuccess: () => void;
}

type Severity = 'critical' | 'high' | 'medium';

const severityOptions: { value: Severity; labelKey: string; colorClass: string; bgClass: string }[] = [
  { value: 'critical', labelKey: 'nc.severityCritical', colorClass: 'text-red-500', bgClass: 'bg-red-500/20 border-red-500/50 hover:bg-red-500/30' },
  { value: 'high', labelKey: 'nc.severityHigh', colorClass: 'text-orange-500', bgClass: 'bg-orange-500/20 border-orange-500/50 hover:bg-orange-500/30' },
  { value: 'medium', labelKey: 'nc.severityMedium', colorClass: 'text-yellow-500', bgClass: 'bg-yellow-500/20 border-yellow-500/50 hover:bg-yellow-500/30' },
];

interface PhotoFile {
  file: File;
  preview: string;
  uploading: boolean;
  uploaded: boolean;
  filePath?: string;
}

export function CreateNCFromItem({
  open,
  onOpenChange,
  inspectionId,
  inspectionItemId,
  siteId,
  itemTitle,
  onSuccess,
}: CreateNCFromItemProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateLocale = i18n.language === 'pt' ? pt : undefined;

  const [title, setTitle] = useState(`NC - ${itemTitle}`);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [standardViolated, setStandardViolated] = useState('');
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation
  const isValid = title.length >= 5 && description.length >= 10;

  const uploadPhoto = async (photoFile: PhotoFile): Promise<string | null> => {
    const fileExt = photoFile.file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `nc-evidence/${siteId}/${fileName}`;

    const { error } = await supabase.storage
      .from('captures')
      .upload(filePath, photoFile.file);

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    return filePath;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      setIsSubmitting(true);

      // Upload all photos first
      const uploadedPaths: string[] = [];
      for (const photo of photos) {
        const path = await uploadPhoto(photo);
        if (path) {
          uploadedPaths.push(path);
        }
      }

      // Create NC record
      const { data: ncData, error: ncError } = await supabase
        .from('nonconformities')
        .insert({
          inspection_id: inspectionId,
          inspection_item_id: inspectionItemId,
          site_id: siteId,
          title,
          description,
          severity,
          corrective_action: correctiveAction || null,
          due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
          standard_violated: standardViolated || null,
          created_by: user?.id,
          status: 'OPEN',
        })
        .select()
        .single();

      if (ncError) throw ncError;

      // Create evidence records for each photo
      if (uploadedPaths.length > 0 && ncData) {
        const evidenceRecords = uploadedPaths.map(filePath => ({
          nonconformity_id: ncData.id,
          file_path: filePath,
        }));

        const { error: evidenceError } = await supabase
          .from('nonconformity_evidence')
          .insert(evidenceRecords);

        if (evidenceError) {
          console.error('Evidence insert error:', evidenceError);
        }
      }

      return ncData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nonconformities'] });
      toast({
        title: t('nc.created'),
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
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setCorrectiveAction('');
    setDueDate(undefined);
    setStandardViolated('');
    // Revoke object URLs to avoid memory leaks
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    } else {
      setTitle(`NC - ${itemTitle}`);
    }
    onOpenChange(newOpen);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPhotos: PhotoFile[] = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      uploading: false,
      uploaded: false,
    }));

    setPhotos(prev => [...prev, ...newPhotos]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      URL.revokeObjectURL(newPhotos[index].preview);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            {t('nc.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="nc-title">{t('nc.title')}</Label>
            <Input
              id="nc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('nc.titlePlaceholder')}
            />
          </div>

          {/* Description - Required */}
          <div className="space-y-2">
            <Label htmlFor="nc-description">
              {t('nc.description')} <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="nc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('nc.descriptionPlaceholder')}
              rows={3}
              className={cn(
                description.length > 0 && description.length < 10 && 'border-red-500'
              )}
            />
            {description.length > 0 && description.length < 10 && (
              <p className="text-xs text-red-500">{t('nc.descriptionRequired')}</p>
            )}
          </div>

          {/* Severity - Color-coded buttons */}
          <div className="space-y-2">
            <Label>{t('nc.severity')}</Label>
            <div className="grid grid-cols-3 gap-3">
              {severityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSeverity(option.value)}
                  className={cn(
                    'p-3 rounded-lg border-2 transition-all text-center',
                    severity === option.value
                      ? option.bgClass + ' border-2'
                      : 'border-border hover:border-muted-foreground/50 bg-muted/30'
                  )}
                >
                  <span className={cn('font-medium', option.colorClass)}>
                    {t(option.labelKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Due Date and Standard Violated */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('nc.dueDate')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dueDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'dd MMM yyyy', { locale: dateLocale }) : t('common.select')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    disabled={(date) => date < new Date()}
                    locale={dateLocale}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nc-standard">{t('nc.standardViolated')}</Label>
              <Input
                id="nc-standard"
                value={standardViolated}
                onChange={(e) => setStandardViolated(e.target.value)}
                placeholder={t('nc.standardViolatedPlaceholder')}
              />
            </div>
          </div>

          {/* Evidence Photos */}
          <div className="space-y-2">
            <Label>{t('nc.evidence')}</Label>
            <div className="space-y-3">
              {/* Photo Grid */}
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={photo.preview}
                        alt={`Evidence ${index + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Upload Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Camera className="w-4 h-4 mr-2" />
                {t('nc.addEvidence')}
              </Button>
            </div>
          </div>

          {/* Corrective Action */}
          <div className="space-y-2">
            <Label htmlFor="nc-corrective">{t('nc.correctiveAction')}</Label>
            <Textarea
              id="nc-corrective"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder={t('nc.correctiveActionPlaceholder')}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isValid || isSubmitting}
            className="bg-red-500 hover:bg-red-600"
          >
            {isSubmitting ? (
              <>
                <Upload className="w-4 h-4 mr-2 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('nc.create')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
