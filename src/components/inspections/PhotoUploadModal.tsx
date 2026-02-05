import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, X, ImagePlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

interface PhotoUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  inspectionItemId: string;
  siteId: string;
  itemTitle: string;
  onSuccess: () => void;
}

export function PhotoUploadModal({
  open,
  onOpenChange,
  inspectionId,
  inspectionItemId,
  siteId,
  itemTitle,
  onSuccess,
}: PhotoUploadModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!user || selectedFiles.length === 0) return;

      const uploadPromises = selectedFiles.map(async (file) => {
        const timestamp = Date.now();
        const uuid = crypto.randomUUID();
        const filePath = `inspections/${siteId}/${inspectionId}/${inspectionItemId}/${timestamp}_${uuid}_${file.name}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('captures')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get or create a capture point
        const { data: points } = await supabase
          .from('capture_points')
          .select('id')
          .limit(1);

        if (!points || points.length === 0) {
          throw new Error('No capture points available');
        }

        // Create capture record
        const { data: capture, error: captureError } = await supabase
          .from('captures')
          .insert({
            file_path: filePath,
            capture_point_id: points[0].id,
            user_id: user.id,
            source_type: 'phone_manual',
            mime_type: file.type,
            size_bytes: file.size,
          })
          .select()
          .single();

        if (captureError) throw captureError;

        // Create evidence link with item reference
        const { error: linkError } = await supabase
          .from('evidence_links')
          .insert({
            inspection_id: inspectionId,
            capture_id: capture.id,
            inspection_item_id: inspectionItemId,
            kind: 'item_evidence',
          });

        if (linkError) throw linkError;

        return capture;
      });

      return Promise.all(uploadPromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-evidence', inspectionId] });
      toast({
        title: t('inspections.detail.photoUploaded'),
      });
      onSuccess();
      handleClose();
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
      
      // Generate previews
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviews(prev => [...prev, e.target?.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setPreviews([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('inspections.detail.attachPhoto')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{itemTitle}</p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Input */}
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex flex-col items-center justify-center">
              <ImagePlus className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t('captures.dropFiles')}</p>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>

          {/* Preview Grid */}
          {previews.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {previews.map((preview, index) => (
                <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                  <img
                    src={preview}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={selectedFiles.length === 0 || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('captures.uploading')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {t('captures.upload')} ({selectedFiles.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
