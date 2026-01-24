import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Plus, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Inspections() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('inspections.title')}</h1>
          <p className="text-muted-foreground">{t('inspections.subtitle')}</p>
        </div>
        <Button className="bg-gradient-to-r from-primary to-accent">
          <Plus className="w-4 h-4 mr-2" />
          {t('inspections.new')}
        </Button>
      </div>

      <Card className="glass border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ClipboardCheck className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">{t('inspections.noInspections')}</h3>
          <p className="text-muted-foreground text-center mt-1">{t('inspections.startInspecting')}</p>
          <Button className="mt-4">
            <Plus className="w-4 h-4 mr-2" />
            {t('inspections.new')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
