import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, User, Bell, Palette, Globe, Moon, Sun, Monitor, ClipboardList, Users, Upload, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useTheme } from '@/components/theme-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamTab } from '@/components/settings/TeamTab';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const activeTab = searchParams.get('tab') || 'general';
  const [fullName, setFullName] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { full_name?: string; avatar_url?: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success(t('settings.profileSaved', 'Perfil actualizado com sucesso'));
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({ full_name: fullName });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setAvatarUploading(true);
    const filePath = `avatars/${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('site-images').upload(filePath, file);

    if (uploadError) {
      toast.error(uploadError.message);
      setAvatarUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('site-images').getPublicUrl(filePath);
    updateProfileMutation.mutate({ avatar_url: publicUrl });
    setAvatarUploading(false);
  };

  const userInitials = (profile?.full_name || user?.email || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            {t('settings.general')}
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('team.title')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
          {/* Inspection Templates */}
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
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-accent-500 to-accent-600 text-white text-lg font-medium">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    {t('settings.profileUploadAvatar', 'Carregar foto')}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label>{t('settings.profileName', 'Nome completo')}</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                />
              </div>

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label>{t('auth.email')}</Label>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>

              <Button
                onClick={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? t('common.loading') : t('settings.profileSave', 'Guardar alterações')}
              </Button>
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
                  <Button variant={theme === 'light' ? 'default' : 'outline'} className="flex flex-col items-center gap-2 h-auto py-4" onClick={() => setTheme('light')}>
                    <Sun className="w-5 h-5" /><span className="text-xs">{t('settings.themeLight')}</span>
                  </Button>
                  <Button variant={theme === 'dark' ? 'default' : 'outline'} className="flex flex-col items-center gap-2 h-auto py-4" onClick={() => setTheme('dark')}>
                    <Moon className="w-5 h-5" /><span className="text-xs">{t('settings.themeDark')}</span>
                  </Button>
                  <Button variant={theme === 'system' ? 'default' : 'outline'} className="flex flex-col items-center gap-2 h-auto py-4" onClick={() => setTheme('system')}>
                    <Monitor className="w-5 h-5" /><span className="text-xs">{t('settings.themeSystem')}</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
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
              <p className="text-sm text-muted-foreground">{t('settings.notificationsComingSoon')}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
