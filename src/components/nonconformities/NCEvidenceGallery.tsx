import { useEffect, useState } from 'react';
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
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

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

  // Pre-assina URLs para as miniaturas (TTL 1h). O click re-assina na hora.
  useEffect(() => {
    if (!evidence || evidence.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        evidence.map(async (item: any) => {
          const { data } = await supabase.storage
            .from('captures')
            .createSignedUrl(item.file_path, 3600);
          return [item.id, data?.signedUrl ?? ''] as const;
        })
      );
      if (!cancelled) setSignedUrls(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [evidence]);

  // Re-assina no momento do click para evitar links expirados (TTL 1h).
  const openEvidence = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('captures')
      .createSignedUrl(filePath, 3600);
    if (error || !data) return;
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

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
      {evidence.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => openEvidence(item.file_path)}
          className="aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-90 transition-opacity p-0 border-0"
        >
          {signedUrls[item.id] ? (
            <img
              src={signedUrls[item.id]}
              alt="Evidence"
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/placeholder.svg';
              }}
            />
          ) : (
            <Skeleton className="w-full h-full" />
          )}
        </button>
      ))}
    </div>
  );
}
