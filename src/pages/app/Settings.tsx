import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, User, Bell, Palette, Globe, Moon, Sun, Monitor, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useTheme } from '@/components/theme-provider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const languages = [
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {/* Inspection Templates Section */}
      <Card 
        className="glass border-border/50 cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => navigate('/app/settings/templates')}
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('templates.title')}</CardTitle>
              <CardDescription>{t('templates.subtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Profile Section */}
      <Card className="glass border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('settings.profile')}</CardTitle>
              <CardDescription>{t('settings.account')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('auth.email')}</Label>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Section */}
      <Card className="glass border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Palette className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('settings.appearance')}</CardTitle>
              <CardDescription>{t('settings.theme')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Language */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {t('settings.language')}
            </Label>
            <Select value={i18n.language} onValueChange={(value) => i18n.changeLanguage(value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Theme */}
          <div className="space-y-3">
            <Label>{t('settings.theme')}</Label>
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                className="flex flex-col items-center gap-2 h-auto py-4"
                onClick={() => setTheme('light')}
              >
                <Sun className="w-5 h-5" />
                <span className="text-xs">{t('settings.themeLight')}</span>
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                className="flex flex-col items-center gap-2 h-auto py-4"
                onClick={() => setTheme('dark')}
              >
                <Moon className="w-5 h-5" />
                <span className="text-xs">{t('settings.themeDark')}</span>
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                className="flex flex-col items-center gap-2 h-auto py-4"
                onClick={() => setTheme('system')}
              >
                <Monitor className="w-5 h-5" />
                <span className="text-xs">{t('settings.themeSystem')}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Section */}
      <Card className="glass border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('settings.notifications')}</CardTitle>
              <CardDescription>{t('nav.comingSoon')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configurações de notificações disponíveis em breve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
