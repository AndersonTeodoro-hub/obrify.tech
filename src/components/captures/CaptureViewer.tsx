import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { X, ChevronLeft, ChevronRight, Download, Image, Video, View } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { CaptureWithDetails, CaptureCategory } from '@/types/captures';
import { SOURCE_TO_CATEGORY } from '@/types/captures';

interface CaptureViewerProps {
  capture: CaptureWithDetails | null;
  captures: CaptureWithDetails[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (capture: CaptureWithDetails) => void;
}

const TYPE_ICONS: Record<CaptureCategory, React.ElementType> = {
  photo: Image,
  video: Video,
  panorama: View,
};

export function CaptureViewer({
  capture,
  captures,
  open,
  onOpenChange,
  onNavigate,
}: CaptureViewerProps) {
  const { t } = useTranslation();

  const currentIndex = capture ? captures.findIndex((c) => c.id === capture.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < captures.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(captures[currentIndex - 1]);
    }
  }, [hasPrev, captures, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      onNavigate(captures[currentIndex + 1]);
    }
  }, [hasNext, captures, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, goToPrev, goToNext]);

  if (!capture) return null;

  const category = SOURCE_TO_CATEGORY[capture.source_type];
  const Icon = TYPE_ICONS[category];
  const captureDate = capture.captured_at || capture.created_at;

  const initials = capture.profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 bg-black/95 border-none">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
          onClick={() => onOpenChange(false)}
        >
          <X className="w-6 h-6" />
        </Button>

        {/* Navigation buttons */}
        {hasPrev && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-50 text-white hover:bg-white/20 h-12 w-12"
            onClick={goToPrev}
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>
        )}
        {hasNext && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-50 text-white hover:bg-white/20 h-12 w-12"
            onClick={goToNext}
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        )}

        {/* Main content */}
        <div className="flex items-center justify-center w-full h-full p-12">
          {category === 'video' ? (
            <video
              src={`https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop`}
              className="max-w-full max-h-full object-contain"
              controls
              poster={`https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop`}
            />
          ) : (
            <img
              src={`https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop`}
              alt={capture.capture_point.code}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>

        {/* Info overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 pt-16">
          <div className="flex items-end justify-between max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white/10">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className="text-white">
                <h3 className="text-lg font-semibold">{capture.capture_point.code}</h3>
                <p className="text-sm text-white/70">
                  {capture.capture_point.area.floor.site.name} • {capture.capture_point.area.floor.name} • {capture.capture_point.area.name}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={capture.profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-white/70">
                      {capture.profile?.full_name || t('common.unknown')}
                    </span>
                  </div>
                  <span className="text-white/50">•</span>
                  <span className="text-sm text-white/70">
                    {format(new Date(captureDate), 'dd/MM/yyyy HH:mm')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/30 text-white hover:bg-white/20"
              >
                <Download className="w-4 h-4 mr-2" />
                {t('captures.download')}
              </Button>
            </div>
          </div>

          {/* Counter */}
          <div className="text-center mt-4 text-white/50 text-sm">
            {currentIndex + 1} {t('common.of')} {captures.length}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
