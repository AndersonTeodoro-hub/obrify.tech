import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { 
  Image, 
  Video, 
  View, 
  MapPin, 
  Calendar, 
  User, 
  FileText, 
  HardDrive,
  Navigation,
  X
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { CaptureWithDetails, CaptureCategory } from '@/types/captures';
import { SOURCE_TO_CATEGORY } from '@/types/captures';
import { cn } from '@/lib/utils';

interface CaptureInfoPanelProps {
  capture: CaptureWithDetails;
  onClose: () => void;
  className?: string;
}

const TYPE_ICONS: Record<CaptureCategory, React.ElementType> = {
  photo: Image,
  video: Video,
  panorama: View,
};

const TYPE_LABELS: Record<CaptureCategory, string> = {
  photo: 'captures.photo',
  video: 'captures.video',
  panorama: 'captures.panorama',
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CaptureInfoPanel({ capture, onClose, className }: CaptureInfoPanelProps) {
  const { t } = useTranslation();

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
    <div className={cn(
      "flex flex-col w-80 bg-background/95 backdrop-blur-sm border-l border-border h-full",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-foreground">{t('captures.viewer.info')}</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Capture Type */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('captures.captureType')}</p>
              <p className="font-medium">{t(TYPE_LABELS[category])}</p>
            </div>
          </div>

          <Separator />

          {/* Capture Point */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span className="text-sm font-medium">{t('captures.location')}</span>
            </div>
            <div className="pl-6 space-y-1 text-sm">
              <p className="font-medium">{capture.capture_point.code}</p>
              <p className="text-muted-foreground">
                {capture.capture_point.area.floor.site.name}
              </p>
              <p className="text-muted-foreground">
                {capture.capture_point.area.floor.name} • {capture.capture_point.area.name}
              </p>
              {capture.capture_point.description && (
                <p className="text-muted-foreground italic">
                  {capture.capture_point.description}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Date */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span className="text-sm font-medium">{t('captures.capturedAt')}</span>
            </div>
            <p className="pl-6 text-sm">
              {format(new Date(captureDate), 'dd/MM/yyyy HH:mm')}
            </p>
          </div>

          <Separator />

          {/* Author */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="text-sm font-medium">{t('captures.capturedBy')}</span>
            </div>
            <div className="pl-6 flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={capture.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm">
                {capture.profile?.full_name || t('common.unknown')}
              </span>
            </div>
          </div>

          <Separator />

          {/* File Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="w-4 h-4" />
              <span className="text-sm font-medium">{t('captures.viewer.fileInfo')}</span>
            </div>
            <div className="pl-6 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('captures.viewer.fileSize')}</span>
                <span>{formatFileSize((capture as any).size_bytes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('captures.viewer.status')}</span>
                <span className="capitalize">{capture.processing_status.toLowerCase()}</span>
              </div>
            </div>
          </div>

          {/* Notes - if we had notes field */}
          {/* GPS Coordinates - if we had them */}
        </div>
      </ScrollArea>
    </div>
  );
}
