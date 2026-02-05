import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Image, Video, View } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  currentFileCount?: number;
  disabled?: boolean;
  accept?: string;
}

export function DropZone({
  onFilesSelected,
  maxFiles = 10,
  currentFileCount = 0,
  disabled = false,
  accept = 'image/*,video/*',
}: DropZoneProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);

  const remainingSlots = maxFiles - currentFileCount;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && remainingSlots > 0) {
      setIsDragging(true);
    }
  }, [disabled, remainingSlots]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || remainingSlots <= 0) return;

    const files = Array.from(e.dataTransfer.files).slice(0, remainingSlots);
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [disabled, remainingSlots, onFilesSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, remainingSlots);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [remainingSlots, onFilesSelected]);

  return (
    <label
      className={cn(
        'relative flex flex-col items-center justify-center w-full min-h-[160px] border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200',
        isDragging
          ? 'border-primary bg-primary/10 scale-[1.02]'
          : 'border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/50',
        disabled && 'opacity-50 cursor-not-allowed',
        remainingSlots <= 0 && 'opacity-50 cursor-not-allowed'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        className="hidden"
        accept={accept}
        multiple
        onChange={handleFileInput}
        disabled={disabled || remainingSlots <= 0}
      />

      <div className="flex flex-col items-center gap-3 p-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-primary/10">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div className="flex gap-1.5">
            <Image className="w-5 h-5 text-green-500" />
            <Video className="w-5 h-5 text-blue-500" />
            <View className="w-5 h-5 text-purple-500" />
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {t('captures.dropFiles')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('captures.maxFiles', { max: maxFiles })}
          </p>
          {currentFileCount > 0 && (
            <p className="text-xs text-primary mt-1">
              {t('captures.filesSelected', { count: currentFileCount })} ({remainingSlots} {t('captures.remaining')})
            </p>
          )}
        </div>
      </div>

      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/20 rounded-lg">
          <p className="text-lg font-medium text-primary">{t('captures.dropHere')}</p>
        </div>
      )}
    </label>
  );
}
