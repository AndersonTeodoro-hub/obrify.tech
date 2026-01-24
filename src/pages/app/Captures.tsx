import { useTranslation } from 'react-i18next';
import { Camera, Upload, Image, Video, View } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Captures() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('captures.title')}</h1>
          <p className="text-muted-foreground">{t('captures.subtitle')}</p>
        </div>
        <Button className="bg-gradient-to-r from-primary to-accent">
          <Camera className="w-4 h-4 mr-2" />
          {t('captures.new')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass border-border/50 hover:border-primary/50 transition-colors cursor-pointer">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
              <Image className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="font-medium">{t('captures.photo')}</h3>
            <p className="text-sm text-muted-foreground text-center mt-1">
              {t('captures.upload')}
            </p>
          </CardContent>
        </Card>

        <Card className="glass border-border/50 hover:border-primary/50 transition-colors cursor-pointer">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
              <Video className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="font-medium">{t('captures.video')}</h3>
            <p className="text-sm text-muted-foreground text-center mt-1">
              {t('captures.upload')}
            </p>
          </CardContent>
        </Card>

        <Card className="glass border-border/50 hover:border-primary/50 transition-colors cursor-pointer">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
              <View className="w-8 h-8 text-purple-500" />
            </div>
            <h3 className="font-medium">{t('captures.panorama')}</h3>
            <p className="text-sm text-muted-foreground text-center mt-1">
              {t('captures.upload')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Camera className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">{t('captures.noCaptures')}</h3>
          <p className="text-muted-foreground text-center mt-1">{t('captures.startCapturing')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
