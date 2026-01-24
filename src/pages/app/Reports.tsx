import { useTranslation } from 'react-i18next';
import { BarChart3, Download, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Reports() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.reports')}</h1>
          <p className="text-muted-foreground">{t('inspections.generateReport')}</p>
        </div>
      </div>

      <Card className="glass border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">{t('common.noResults')}</h3>
          <p className="text-muted-foreground text-center mt-1">
            {t('inspections.startInspecting')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
