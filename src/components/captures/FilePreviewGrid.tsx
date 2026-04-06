import { useTranslation } from 'react-i18next';
import { X, Image, Video, View, MapPin, Calendar, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { FileWithPreview } from '@/types/captures';

interface FilePreviewGridProps {
  files: FileWithPreview[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export function FilePreviewGrid({ files, onRemove, disabled }: FilePreviewGridProps) {
  const { t } = useTranslation();

  if (files.length === 0) return null;

  const getFileTypeIcon = (mimeType: string) => {
    if (mimeType.includes('video')) {
      return <Video className="w-3 h-3 text-blue-500" />;
    }
    if (mimeType.includes('360') || mimeType.includes('panorama')) {
      return <View className="w-3 h-3 text-purple-500" />;
    }
    return <Image className="w-3 h-3 text-green-500" />;
  };

  const getStatusBadge = (file: FileWithPreview) => {
    switch (file.status) {
      case 'compressing':
        return (
          <Badge variant="secondary" className="bg-amber-500/20 text-amber-500 text-xs">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            {file.statusText || 'A comprimir...'}
          </Badge>
        );
      case 'uploading':
        return (
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-500 text-xs">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            {file.statusText || `${file.progress}%`}
          </Badge>
        );
      case 'success':
        return (
          <Badge variant="secondary" className="bg-green-500/20 text-green-500 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('common.success')}
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="text-xs">
            <XCircle className="w-3 h-3 mr-1" />
            {t('common.error')}
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {files.map((file) => (
        <div
          key={file.id}
          className={cn(
            'relative group rounded-lg overflow-hidden border border-border bg-muted/30',
            file.status === 'error' && 'border-destructive',
            file.status === 'success' && 'border-green-500/50'
          )}
        >
          {/* Thumbnail */}
          <div className="aspect-square relative">
            {file.file.type.startsWith('video/') ? (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <Video className="w-8 h-8 text-muted-foreground" />
              </div>
            ) : (
              <img
                src={file.preview}
                alt={file.file.name}
                className="w-full h-full object-cover"
              />
            )}

            {/* Remove button */}
            {!disabled && file.status !== 'compressing' && file.status !== 'uploading' && file.status !== 'success' && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onRemove(file.id)}
              >
                <X className="w-3 h-3" />
              </Button>
            )}

            {/* Progress overlay */}
            {(file.status === 'compressing' || file.status === 'uploading') && (
              <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">{file.statusText}</p>
                <Progress value={file.progress} className="w-3/4 h-1" />
              </div>
            )}

            {/* Success overlay */}
            {file.status === 'success' && (
              <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
            )}

            {/* Error overlay */}
            {file.status === 'error' && (
              <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-2 space-y-1">
            <div className="flex items-center gap-1">
              {getFileTypeIcon(file.file.type)}
              <span className="text-xs text-muted-foreground truncate flex-1">
                {file.file.name}
              </span>
            </div>

            {/* EXIF info */}
            {file.exifData && (
              <div className="flex flex-wrap gap-1">
                {file.exifData.dateTime && (
                  <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Calendar className="w-2.5 h-2.5" />
                    {format(file.exifData.dateTime, 'dd/MM/yy')}
                  </div>
                )}
                {file.exifData.latitude && file.exifData.longitude && (
                  <div className="flex items-center gap-0.5 text-[10px] text-green-500">
                    <MapPin className="w-2.5 h-2.5" />
                    GPS
                  </div>
                )}
              </div>
            )}

            {/* Status badge */}
            {getStatusBadge(file)}

            {/* Error message */}
            {file.status === 'error' && file.error && (
              <p className="text-[10px] text-destructive truncate">{file.error}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
