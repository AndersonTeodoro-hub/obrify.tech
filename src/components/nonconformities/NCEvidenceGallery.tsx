import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface NCEvidenceGalleryProps {
  ncId: string;
}

export function NCEvidenceGallery({ ncId }: NCEvidenceGalleryProps) {
  const { t } = useTranslation();

  const { data: evidence, isLoading } = useQuery({
    queryKey: ['nc-evidence', ncId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nonconformity_evidence')
        .select('*')
        .eq('nonconformity_id', ncId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!ncId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (!evidence || evidence.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{t('nc.detail.noEvidence')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {evidence.map((item) => {
        const { data: urlData } = supabase.storage
          .from('captures')
          .getPublicUrl(item.file_path);

        return (
          <a
            key={item.id}
            href={urlData.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-90 transition-opacity"
          >
            <img
              src={urlData.publicUrl}
              alt="Evidence"
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/placeholder.svg';
              }}
            />
          </a>
        );
      })}
    </div>
  );
}
