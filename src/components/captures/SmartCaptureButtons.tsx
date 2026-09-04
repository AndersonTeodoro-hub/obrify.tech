import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SmartCaptureButtonsProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  // Avisa o pai do tipo pretendido ANTES de abrir a câmara, para que o rádio
  // "Tipo de captura" (que decide o source_type gravado) fique sincronizado com o
  // botão físico premido — sem isto, tocar "Panorama" gravava phone_manual em vez
  // de phone_360 sempre que o rádio ficava no valor por omissão ("photo").
  onCaptureTypeSelect?: (type: 'photo' | 'panorama') => void;
}

export function SmartCaptureButtons({ onFilesSelected, disabled, onCaptureTypeSelect }: SmartCaptureButtonsProps) {
  const { t } = useTranslation();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const panoramaInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(Array.from(files));
    }
    // Reset so the same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="flex gap-3">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <input
        ref={panoramaInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
        multiple
      />

      <Button
        type="button"
        variant="outline"
        className="flex-1 h-20 flex-col gap-2 border-dashed border-2 border-accent/40 hover:border-accent hover:bg-accent/5"
        onClick={() => {
          onCaptureTypeSelect?.('photo');
          photoInputRef.current?.click();
        }}
        disabled={disabled}
      >
        <Camera className="w-6 h-6 text-accent" />
        <span className="text-sm font-medium">{t('captures.photo')}</span>
      </Button>

      <Button
        type="button"
        variant="outline"
        className="flex-1 h-20 flex-col gap-2 border-dashed border-2 border-primary/40 hover:border-primary hover:bg-primary/5"
        onClick={() => {
          onCaptureTypeSelect?.('panorama');
          panoramaInputRef.current?.click();
        }}
        disabled={disabled}
      >
        <ScanLine className="w-6 h-6 text-primary" />
        <span className="text-sm font-medium">{t('captures.panorama')}</span>
      </Button>
    </div>
  );
}
