import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck, Calendar, MapPin, User } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

export default function InspectionDetail() {
  const { t, i18n } = useTranslation();
  const { inspectionId } = useParams<{ inspectionId: string }>();
  const navigate = useNavigate();
  const dateLocale = i18n.language === 'pt' ? pt : undefined;

  // Fetch inspection with related data
  const { data: inspection, isLoading } = useQuery({
    queryKey: ['inspection', inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select(`
          *,
          sites(id, name),
          inspection_templates(id, name, category),
          floors(id, name),
          areas(id, name),
          capture_points(id, code)
        `)
        .eq('id', inspectionId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!inspectionId,
  });

  // Fetch template items
  const { data: templateItems } = useQuery({
    queryKey: ['template-items', inspection?.template_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspection_template_items')
        .select('*')
        .eq('template_id', inspection!.template_id)
        .order('order_index');
      
      if (error) throw error;
      return data;
    },
    enabled: !!inspection?.template_id,
  });

  // Fetch inspector profile
  const { data: inspector } = useQuery({
    queryKey: ['inspector-profile', inspection?.created_by],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', inspection!.created_by)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!inspection?.created_by,
  });

  const getStatusBadge = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    switch (normalizedStatus) {
      case 'draft':
        return <Badge variant="secondary">{t('inspections.statusDraft')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30">{t('inspections.statusInProgress')}</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30">{t('inspections.statusCompleted')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryBadge = (category: string | null) => {
    const colors: Record<string, string> = {
      structure: 'bg-blue-500/20 text-blue-400',
      finishes: 'bg-amber-500/20 text-amber-400',
      installations: 'bg-green-500/20 text-green-400',
      safety: 'bg-red-500/20 text-red-400',
    };
    const colorClass = category ? colors[category] || 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground';
    return (
      <Badge className={colorClass}>
        {category ? t(`templates.categories.${category}`) : '-'}
      </Badge>
    );
  };

  const getLocationString = () => {
    const parts = [];
    if (inspection?.floors?.name) parts.push(inspection.floors.name);
    if (inspection?.areas?.name) parts.push(inspection.areas.name);
    if (inspection?.capture_points?.code) parts.push(inspection.capture_points.code);
    return parts.length > 0 ? parts.join(' > ') : t('inspections.general');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <ClipboardCheck className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">{t('common.noResults')}</h3>
        <Button variant="link" onClick={() => navigate('/app/inspections')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app/inspections')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{inspection.inspection_templates?.name}</h1>
            {getCategoryBadge(inspection.inspection_templates?.category)}
            {getStatusBadge(inspection.status)}
          </div>
          <p className="text-muted-foreground">{inspection.sites?.name}</p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('inspections.date')}</p>
                <p className="font-medium">
                  {format(new Date(inspection.scheduled_at || inspection.created_at), 'dd MMM yyyy', { locale: dateLocale })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('inspections.location')}</p>
                <p className="font-medium">{getLocationString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('inspections.inspector')}</p>
                <p className="font-medium">{inspector?.full_name || t('common.unknown')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ClipboardCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('inspections.items')}</p>
                <p className="font-medium">{templateItems?.length || 0} {t('templates.items')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Checklist Items (Placeholder for future implementation) */}
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle>{t('inspections.checklist')}</CardTitle>
        </CardHeader>
        <CardContent>
          {templateItems && templateItems.length > 0 ? (
            <div className="space-y-3">
              {templateItems.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.title}</p>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  <Badge variant="outline">
                    {item.is_required ? t('templates.required') : t('common.no')}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t('templates.noItems')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline">
          {t('common.save')} {t('inspections.statusDraft')}
        </Button>
        <Button className="bg-gradient-to-r from-primary to-accent">
          {t('inspections.complete')}
        </Button>
      </div>
    </div>
  );
}
