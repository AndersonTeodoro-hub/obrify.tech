import { useTranslation } from 'react-i18next';
import { Play, BookOpen, MessageCircle, Keyboard } from 'lucide-react';

interface HelpMenuProps {
  onStartTour: () => void;
  onOpenKeyboardShortcuts: () => void;
  onClose: () => void;
}

export function HelpMenu({ onStartTour, onOpenKeyboardShortcuts, onClose }: HelpMenuProps) {
  const { t } = useTranslation();

  const items = [
    {
      icon: Play,
      iconBg: 'bg-accent/10',
      iconColor: 'text-accent',
      label: t('onboarding.guidedTour'),
      desc: t('onboarding.guidedTourDesc'),
      onClick: () => { onClose(); onStartTour(); },
    },
    {
      icon: BookOpen,
      iconBg: 'bg-info/10',
      iconColor: 'text-info',
      label: t('onboarding.documentation'),
      desc: t('onboarding.documentationDesc'),
      onClick: () => {},
    },
    {
      icon: MessageCircle,
      iconBg: 'bg-success/10',
      iconColor: 'text-success',
      label: t('onboarding.talkToSupport'),
      desc: t('onboarding.talkToSupportDesc'),
      onClick: () => {},
    },
    {
      icon: Keyboard,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
      label: t('onboarding.keyboardShortcuts'),
      desc: t('onboarding.keyboardShortcutsDesc'),
      onClick: () => { onClose(); onOpenKeyboardShortcuts(); },
    },
  ];

  return (
    <div className="w-72">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-foreground">{t('onboarding.helpCenter')}</h3>
        <p className="text-sm text-muted-foreground">{t('onboarding.howCanWeHelp')}</p>
      </div>

      <div className="p-2 space-y-1">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={item.onClick}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors text-left"
          >
            <div className={`w-10 h-10 rounded-lg ${item.iconBg} flex items-center justify-center flex-shrink-0`}>
              <item.icon className={`w-5 h-5 ${item.iconColor}`} />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="p-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          {t('onboarding.version')} 1.0.0 •{' '}
          <span className="text-accent hover:underline cursor-pointer">
            {t('onboarding.releaseNotes')}
          </span>
        </p>
      </div>
    </div>
  );
}
