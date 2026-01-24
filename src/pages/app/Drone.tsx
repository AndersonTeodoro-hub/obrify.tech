import { useTranslation } from 'react-i18next';
import { Plane, Wifi, Battery, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Drone() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.drone')}</h1>
          <p className="text-muted-foreground">{t('brand.integrationNote')} {t('brand.drones')}</p>
        </div>
        <Badge variant="outline" className="text-primary border-primary">
          {t('nav.comingSoon')}
        </Badge>
      </div>

      <Card className="glass border-border/50 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6">
            <Plane className="w-12 h-12 text-primary" />
          </div>
          <h3 className="text-xl font-bold mb-2">{t('nav.drone')} - Fase 2</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Integração com drones para capturas aéreas automatizadas, mapeamento 3D e monitorização em tempo real das suas obras.
          </p>
          
          <div className="grid grid-cols-3 gap-6 mt-4">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Wifi className="w-8 h-8" />
              <span className="text-sm">Conexão em tempo real</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <MapPin className="w-8 h-8" />
              <span className="text-sm">Rotas programadas</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Battery className="w-8 h-8" />
              <span className="text-sm">Gestão de bateria</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
