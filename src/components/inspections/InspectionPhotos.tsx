import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

interface EvidencePhoto {
  id: string;
  capture_id: string;
  file_path: string;
}

interface InspectionPhotosProps {
  inspectionId: string;
  siteId: string;
  photos: EvidencePhoto[];
  isReadOnly: boolean;
}

export function InspectionPhotos({
  inspectionId,
  siteId,
  photos,
  isReadOnly,
}: InspectionPhotosProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Generate signed URLs for photos
  const getSignedUrl = useCallback(async (filePath: string) => {
    if (signedUrls[filePath]) return signedUrls[filePath];
    
    const { data } = await supabase.storage
      .from('captures')
      .createSignedUrl(filePath, 3600);
    
    if (data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [filePath]: data.signedUrl }));
      return data.signedUrl;
    }
    return null;
  }, [signedUrls]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      if (!user) throw new Error('Not authenticated');

      const uploadPromises = Array.from(files).map(async (file) => {
        const timestamp = Date.now();
        const uuid = crypto.randomUUID();
        const filePath = `inspections/${siteId}/${inspectionId}/${timestamp}_${uuid}_${file.name}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('captures')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Create capture record (we need a capture_point_id, so we'll get or create a default)
        const { data: points } = await supabase
          .from('capture_points')
          .select('id')
          .limit(1);

        if (!points || points.length === 0) {
          throw new Error('No capture points available');
        }

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

        // Create evidence link
        const { error: linkError } = await supabase
          .from('evidence_links')
          .insert({
            inspection_id: inspectionId,
            capture_id: capture.id,
            kind: 'general',
          });

        if (linkError) throw linkError;

        return capture;
      });

      return Promise.all(uploadPromises);
    },
    onSuccess: (captures) => {
      queryClient.invalidateQueries({ queryKey: ['inspection-evidence', inspectionId] });
      toast({
        title: t('inspections.detail.photoUploaded'),
        description: `${captures.length} ${t('captures.title').toLowerCase()}`,
      });
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      uploadMutation.mutate(e.target.files);
    }
  };

  // Load signed URLs for existing photos
  useState(() => {
    photos.forEach(photo => {
      getSignedUrl(photo.file_path);
    });
  });

  return (
    <Card className="glass border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('inspections.detail.generalPhotos')}</CardTitle>
        {!isReadOnly && (
          <label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button variant="outline" size="sm" asChild disabled={isUploading}>
              <span className="cursor-pointer">
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4 mr-2" />
                )}
                {t('inspections.detail.addPhotos')}
              </span>
            </Button>
          </label>
        )}
      </CardHeader>
      <CardContent>
        {photos.length > 0 ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
              >
                {signedUrls[photo.file_path] ? (
                  <img
                    src={signedUrls[photo.file_path]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {t('inspections.detail.noPhotos')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
