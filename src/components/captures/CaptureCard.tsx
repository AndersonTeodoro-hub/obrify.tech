import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Image, Video, View, ImageOff, Loader2 } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import type { CaptureWithDetails, CaptureCategory } from '@/types/captures';
import { SOURCE_TO_CATEGORY, captureTitle, captureLocationLabel } from '@/types/captures';

interface CaptureCardProps {
  capture: CaptureWithDetails;
  onClick: () => void;
}

const TYPE_ICONS: Record<CaptureCategory, React.ElementType> = {
  photo: Image,
  video: Video,
  panorama: View,
};

const TYPE_COLORS: Record<CaptureCategory, string> = {
  photo: 'bg-green-500/20 text-green-400 border border-green-500/30',
  video: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
  panorama: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
};

export function CaptureCard({ capture, onClick }: CaptureCardProps) {
  const { t } = useTranslation();
  const category = SOURCE_TO_CATEGORY[capture.source_type];
  const Icon = TYPE_ICONS[category];

  const captureDate = capture.captured_at || capture.created_at;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageState, setImageState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setImageState('loading');
    setImageUrl(null);
    supabase.storage
      .from('captures')
      .createSignedUrl(capture.file_path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          console.error('CaptureCard: falha ao gerar URL assinado', capture.id, error);
          setImageState('error');
          return;
        }
        setImageUrl(data.signedUrl);
        setImageState('ok');
      });
    return () => { cancelled = true; };
  }, [capture.file_path, capture.id]);

  return (
    <Card
      className="overflow-hidden rounded-xl cursor-pointer group border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg transition-all duration-300"
      onClick={onClick}
    >
      <CardContent className="p-0">
        <AspectRatio ratio={16 / 9}>
          <div className="relative w-full h-full bg-slate-100 dark:bg-slate-800">
            {/* Imagem real da captura (URL assinado do bucket "captures"). Falha visível, nunca placeholder silencioso. */}
            {imageState === 'loading' && (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            )}
            {imageState === 'error' && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400 dark:text-slate-500">
                <ImageOff className="w-6 h-6" />
                <span className="text-[10px]">{t('captures.imageLoadError', 'Falha ao carregar imagem')}</span>
              </div>
            )}
            {imageState === 'ok' && imageUrl && (
              <img
                src={imageUrl}
                alt={captureTitle(capture)}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onLoad={() => setImageState('ok')}
                onError={() => {
                  console.error('CaptureCard: URL assinado gerado mas imagem falhou a carregar', capture.id, imageUrl);
                  setImageState('error');
                }}
              />
            )}
            {/* Enquanto o estado é 'ok' mas a tag <img> ainda não confirmou onLoad, mantemos a imagem montada para disparar onLoad/onError */}

            {/* Type badge overlay */}
            <div className="absolute top-3 left-3">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${TYPE_COLORS[category]}`}>
                <Icon className="w-3 h-3" />
                {t(`captures.${category}`)}
              </div>
            </div>

            {/* Info overlay at bottom - always visible */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent">
              <p className="text-sm font-medium text-white truncate">
                {captureTitle(capture)}
              </p>
              <p className="text-xs text-white/70 truncate">
                {captureLocationLabel(capture)}
              </p>
              <p className="text-[10px] text-white/50 mt-1">
                {format(new Date(captureDate), 'dd/MM/yyyy HH:mm')}
              </p>
            </div>
          </div>
        </AspectRatio>
      </CardContent>
    </Card>
  );
}
