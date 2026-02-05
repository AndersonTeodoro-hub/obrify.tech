import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Image, Video, View, Loader2 } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  photo: 'bg-green-500/10 text-green-500',
  video: 'bg-blue-500/10 text-blue-500',
  panorama: 'bg-purple-500/10 text-purple-500',
};

export function CaptureCard({ capture, onClick }: CaptureCardProps) {
  const { t } = useTranslation();
  const category = SOURCE_TO_CATEGORY[capture.source_type];
  const Icon = TYPE_ICONS[category];
  
  const initials = capture.profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??';

  const isProcessing = capture.processing_status === 'PENDING' || capture.processing_status === 'PROCESSING';
  const captureDate = capture.captured_at || capture.created_at;

  return (
    <Card 
      className="glass border-border/50 hover:border-primary/50 transition-all cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      <CardContent className="p-0">
        <AspectRatio ratio={4 / 3}>
          <div className="relative w-full h-full bg-muted">
            {/* Placeholder image - will be replaced with actual thumbnail */}
            <img
              src={`https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=300&fit=crop`}
              alt={capture.capture_point.code}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            
            {/* Type badge overlay */}
            <div className="absolute top-2 left-2">
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[category]}`}>
                <Icon className="w-3 h-3" />
                {t(`captures.${category}`)}
              </div>
            </div>

            {/* Processing status */}
            {isProcessing && (
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('captures.processing')}
                </Badge>
              </div>
            )}

            {/* Gradient overlay at bottom */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />

            {/* Info overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
              <div className="flex items-end justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {capture.capture_point.code}
                  </p>
                  <p className="text-xs text-white/70 truncate">
                    {capture.capture_point.area.floor.name} • {capture.capture_point.area.name}
                  </p>
                </div>
                <Avatar className="h-6 w-6 border border-white/30">
                  <AvatarImage src={capture.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
              <p className="text-[10px] text-white/60 mt-1">
                {format(new Date(captureDate), 'dd/MM/yyyy HH:mm')}
              </p>
            </div>
          </div>
        </AspectRatio>
      </CardContent>
    </Card>
  );
}
