import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTour: () => void;
  onExplore: () => void;
}

export function WelcomeModal({ open, onOpenChange, onStartTour, onExplore }: WelcomeModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg text-center">
        <DialogHeader className="items-center">
          {/* Animated logo */}
          <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-lg animate-fade-in-up mb-2">
            <span className="text-white font-bold text-3xl">S</span>
          </div>

          <DialogTitle className="text-2xl font-bold">
            {t('onboarding.welcomeTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('onboarding.welcomeDesc')}
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 py-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-accent">{t('onboarding.stat1Value')}</p>
            <p className="text-xs text-muted-foreground">{t('onboarding.stat1Label')}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-accent">{t('onboarding.stat2Value')}</p>
            <p className="text-xs text-muted-foreground">{t('onboarding.stat2Label')}</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-accent">{t('onboarding.stat3Value')}</p>
            <p className="text-xs text-muted-foreground">{t('onboarding.stat3Label')}</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onExplore}>
            {t('onboarding.exploreAlone')}
          </Button>
          <Button variant="accent" className="flex-1" onClick={onStartTour}>
            <Play className="w-4 h-4 mr-2" />
            {t('onboarding.startTour')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
