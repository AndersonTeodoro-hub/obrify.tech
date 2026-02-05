import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpMenu } from './HelpMenu';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { startProductTour } from './ProductTour';

interface HelpButtonProps {
  showPulse: boolean;
  onTourComplete: () => void;
}

export function HelpButton({ showPulse, onTourComplete }: HelpButtonProps) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleStartTour = () => {
    setIsMenuOpen(false);
    setTimeout(() => {
      startProductTour(onTourComplete);
    }, 300);
  };

  return (
    <>
      <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                data-tour="help-button"
                className={cn(
                  'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full',
                  'bg-gradient-to-br from-accent to-accent/80',
                  'shadow-lg hover:shadow-xl hover:scale-105',
                  'transition-all duration-200',
                  'flex items-center justify-center',
                  'text-accent-foreground',
                  showPulse && 'help-button-pulse'
                )}
              >
                <Sparkles className="w-6 h-6" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">
            {t('onboarding.discoverSitePulse')}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="top" align="end" className="p-0 w-auto">
          <HelpMenu
            onStartTour={handleStartTour}
            onOpenKeyboardShortcuts={() => {
              setIsMenuOpen(false);
              setShowShortcuts(true);
            }}
            onClose={() => setIsMenuOpen(false)}
          />
        </PopoverContent>
      </Popover>

      <KeyboardShortcutsModal
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
      />
    </>
  );
}
