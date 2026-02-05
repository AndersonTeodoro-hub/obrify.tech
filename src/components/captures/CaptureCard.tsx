import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Image, Video, View, Loader2 } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { CaptureWithDetails, CaptureCategory } from '@/types/captures';
import { SOURCE_TO_CATEGORY } from '@/types/captures';

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

  const isProcessing = capture.processing_status === 'PENDING' || capture.processing_status === 'PROCESSING';
  const captureDate = capture.captured_at || capture.created_at;

  return (
    <Card 
      className="overflow-hidden rounded-xl cursor-pointer group border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg transition-all duration-300"
      onClick={onClick}
    >
      <CardContent className="p-0">
        <AspectRatio ratio={16 / 9}>
          <div className="relative w-full h-full bg-slate-100 dark:bg-slate-800">
            {/* Placeholder image */}
            <img
              src={`https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=225&fit=crop`}
              alt={capture.capture_point.code}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            
            {/* Type badge overlay */}
            <div className="absolute top-3 left-3">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${TYPE_COLORS[category]}`}>
                <Icon className="w-3 h-3" />
                {t(`captures.${category}`)}
              </div>
            </div>

            {/* Processing status */}
            {isProcessing && (
              <div className="absolute top-3 right-3">
                <Badge variant="secondary" className="flex items-center gap-1 backdrop-blur-sm">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('captures.processing')}
                </Badge>
              </div>
            )}

            {/* Info overlay at bottom - always visible */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent">
              <p className="text-sm font-medium text-white truncate">
                {capture.capture_point.code}
              </p>
              <p className="text-xs text-white/70 truncate">
                {capture.capture_point.area.floor.name} • {capture.capture_point.area.name}
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
