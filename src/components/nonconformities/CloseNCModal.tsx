import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Camera, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CloseNCModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ncId: string;
  onClose: (notes: string) => Promise<void>;
  isPending: boolean;
}

export function CloseNCModal({ open, onOpenChange, ncId, onClose, isPending }: CloseNCModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!photo) {
      toast({
        title: t('common.error'),
        description: t('nc.detail.closingPhotoRequired'),
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUploading(true);

      // Upload photo
      const fileName = `nc-closing/${ncId}/${Date.now()}_${photo.name}`;
      const { error: uploadError } = await supabase.storage
        .from('captures')
        .upload(fileName, photo);

      if (uploadError) throw uploadError;

      // Save evidence record
      const { error: evidenceError } = await supabase
        .from('nonconformity_evidence')
        .insert({
          nonconformity_id: ncId,
          file_path: fileName,
        });

      if (evidenceError) throw evidenceError;

      // Close the NC
      await onClose(notes);

      // Reset form
      setNotes('');
      setPhoto(null);
      setPhotoPreview(null);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const isSubmitting = isPending || isUploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('nc.detail.closeNC')}</DialogTitle>
          <DialogDescription>
            {t('nc.detail.closingPhotoRequired')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo Upload */}
          <div>
            <Label>{t('nc.detail.selectPhoto')}</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {photoPreview ? (
              <div className="relative mt-2">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleRemovePhoto}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 w-full h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-colors"
              >
                <Camera className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t('nc.detail.selectPhoto')}</span>
              </button>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="closing-notes">{t('nc.detail.closingNotes')}</Label>
            <Textarea
              id="closing-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('nc.detail.closingNotesPlaceholder')}
              rows={3}
              className="mt-2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !photo}>
            {isSubmitting ? t('common.loading') : t('nc.detail.closeNC')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
