import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck, Calendar, MapPin, User, BarChart3, CheckCircle2, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ChecklistItem } from '@/components/inspections/ChecklistItem';
import { CreateNCFromItem } from '@/components/inspections/CreateNCFromItem';
import { InspectionPhotos } from '@/components/inspections/InspectionPhotos';
import { PhotoUploadModal } from '@/components/inspections/PhotoUploadModal';
import { generateInspectionReport } from '@/services/pdfGenerator';
import type { Database } from '@/integrations/supabase/types';

type InspectionResult = Database['public']['Enums']['inspection_result'];

export default function InspectionDetail() {
  const { t, i18n } = useTranslation();
  const { inspectionId } = useParams<{ inspectionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dateLocale = i18n.language === 'pt' ? pt : undefined;

  // Local state for item results
  const [itemResults, setItemResults] = useState<Map<string, { inspectionItemId: string; result: InspectionResult | null; notes: string }>>(new Map());
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  
  // Modal states
  const [ncModalOpen, setNcModalOpen] = useState(false);
  const [ncItemId, setNcItemId] = useState<string | null>(null);
  const [ncInspectionItemId, setNcInspectionItemId] = useState<string | null>(null);
  const [ncItemTitle, setNcItemTitle] = useState('');
  
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoItemId, setPhotoItemId] = useState<string | null>(null);
  const [photoInspectionItemId, setPhotoInspectionItemId] = useState<string | null>(null);
  const [photoItemTitle, setPhotoItemTitle] = useState('');
  
  // PDF generation state
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Handle PDF generation
  const handleGeneratePDF = async () => {
    if (!inspectionId) return;
    
    setIsGeneratingPDF(true);
    try {
      const blob = await generateInspectionReport(inspectionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-inspecao-${inspectionId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t('reports.downloadSuccess') });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({ 
        title: t('common.error'), 
        description: String(error), 
        variant: 'destructive' 
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Fetch inspection with related data
  const { data: inspection, isLoading } = useQuery({
    queryKey: ['inspection', inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select(`
          *,
          sites(id, name, org_id),
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

  // Fetch existing inspection items
  const { data: existingItems } = useQuery({
    queryKey: ['inspection-items', inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspection_items')
        .select('*')
        .eq('inspection_id', inspectionId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!inspectionId,
  });

  // Fetch evidence links (photos)
  const { data: evidenceLinks } = useQuery({
    queryKey: ['inspection-evidence', inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evidence_links')
        .select(`
          *,
          captures(id, file_path)
        `)
        .eq('inspection_id', inspectionId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!inspectionId,
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

  // Initialize items if they don't exist
  const initializeItemsMutation = useMutation({
    mutationFn: async (templateItemIds: string[]) => {
      const itemsToCreate = templateItemIds.map(templateItemId => ({
        inspection_id: inspectionId!,
        template_item_id: templateItemId,
        result: null,
        notes: null,
      }));

      const { data, error } = await supabase
        .from('inspection_items')
        .insert(itemsToCreate)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-items', inspectionId] });
    },
  });

  // Initialize local state from existing items
  useEffect(() => {
    if (existingItems && templateItems) {
      const newMap = new Map<string, { inspectionItemId: string; result: InspectionResult | null; notes: string }>();
      
      existingItems.forEach(item => {
        newMap.set(item.template_item_id, {
          inspectionItemId: item.id,
          result: item.result,
          notes: item.notes || '',
        });
      });

      // Check for missing items
      const existingTemplateIds = new Set(existingItems.map(i => i.template_item_id));
      const missingTemplateIds = templateItems
        .filter(t => !existingTemplateIds.has(t.id))
        .map(t => t.id);

      if (missingTemplateIds.length > 0) {
        initializeItemsMutation.mutate(missingTemplateIds);
      }

      setItemResults(newMap);
    }
  }, [existingItems, templateItems]);

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({ inspectionItemId, result, notes }: { inspectionItemId: string; result: InspectionResult | null; notes: string }) => {
      const { error } = await supabase
        .from('inspection_items')
        .update({ result, notes: notes || null })
        .eq('id', inspectionItemId);

      if (error) throw error;
    },
  });

  // Save draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      // Update all changed items
      const updates = Array.from(itemResults.entries()).map(([templateItemId, data]) => {
        if (data.inspectionItemId) {
          return supabase
            .from('inspection_items')
            .update({ result: data.result, notes: data.notes || null })
            .eq('id', data.inspectionItemId);
        }
        return null;
      }).filter(Boolean);

      await Promise.all(updates);

      // Update inspection status to IN_PROGRESS if it's still DRAFT
      if (inspection?.status === 'DRAFT') {
        await supabase
          .from('inspections')
          .update({ status: 'IN_PROGRESS' })
          .eq('id', inspectionId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', inspectionId] });
      toast({ title: t('inspections.detail.savedSuccessfully') });
    },
    onError: (error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Complete inspection mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      // Validate required items
      const errors = new Set<string>();
      
      templateItems?.forEach(item => {
        const result = itemResults.get(item.id);
        if (item.is_required && (!result || !result.result)) {
          errors.add(item.id);
        }
        // Check evidence requirement
        if (item.requires_evidence && result?.result) {
          const hasEvidence = evidenceLinks?.some(e => e.inspection_item_id === result.inspectionItemId);
          if (!hasEvidence) {
            errors.add(item.id);
          }
        }
      });

      if (errors.size > 0) {
        setValidationErrors(errors);
        throw new Error('validation_failed');
      }

      // Save all items first
      const updates = Array.from(itemResults.entries()).map(([_, data]) => {
        if (data.inspectionItemId) {
          return supabase
            .from('inspection_items')
            .update({ result: data.result, notes: data.notes || null })
            .eq('id', data.inspectionItemId);
        }
        return null;
      }).filter(Boolean);

      await Promise.all(updates);

      // Update inspection status to COMPLETED
      const { error } = await supabase
        .from('inspections')
        .update({ status: 'COMPLETED' })
        .eq('id', inspectionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', inspectionId] });
      toast({ title: t('inspections.detail.completedSuccessfully') });
    },
    onError: (error) => {
      if (error.message === 'validation_failed') {
        toast({ 
          title: t('common.error'), 
          description: t('inspections.detail.missingRequired'), 
          variant: 'destructive' 
        });
      } else {
        toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      }
    },
  });

  const handleResultChange = (templateItemId: string, result: InspectionResult | null, notes: string) => {
    const current = itemResults.get(templateItemId);
    if (!current) return;

    // Clear validation error for this item
    setValidationErrors(prev => {
      const next = new Set(prev);
      next.delete(templateItemId);
      return next;
    });

    // Update local state
    setItemResults(prev => {
      const next = new Map(prev);
      next.set(templateItemId, { ...current, result, notes });
      return next;
    });

    // Debounced save
    updateItemMutation.mutate({ inspectionItemId: current.inspectionItemId, result, notes });

    // If NC, open modal
    if (result === 'NC' && current.inspectionItemId) {
      const item = templateItems?.find(i => i.id === templateItemId);
      setNcItemId(templateItemId);
      setNcInspectionItemId(current.inspectionItemId);
      setNcItemTitle(item?.title || '');
      setNcModalOpen(true);
    }
  };

  const handleAddPhoto = (templateItemId: string) => {
    const current = itemResults.get(templateItemId);
    const item = templateItems?.find(i => i.id === templateItemId);
    if (current?.inspectionItemId && item) {
      setPhotoItemId(templateItemId);
      setPhotoInspectionItemId(current.inspectionItemId);
      setPhotoItemTitle(item.title);
      setPhotoModalOpen(true);
    }
  };

  // Calculate progress
  const progress = useMemo(() => {
    if (!templateItems) return { completed: 0, total: 0 };
    const completed = Array.from(itemResults.values()).filter(r => r.result !== null).length;
    return { completed, total: templateItems.length };
  }, [itemResults, templateItems]);

  // Group photos by item
  const photosByItem = useMemo(() => {
    const map = new Map<string, number>();
    evidenceLinks?.forEach(link => {
      if (link.inspection_item_id) {
        map.set(link.inspection_item_id, (map.get(link.inspection_item_id) || 0) + 1);
      }
    });
    return map;
  }, [evidenceLinks]);

  // General photos (no item reference)
  const generalPhotos = useMemo(() => {
    return evidenceLinks?.filter(link => !link.inspection_item_id && link.captures).map(link => ({
      id: link.id,
      capture_id: link.capture_id,
      file_path: (link.captures as any)?.file_path || '',
    })) || [];
  }, [evidenceLinks]);

  const isReadOnly = inspection?.status === 'COMPLETED';

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
        <div className="grid gap-4 md:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
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
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app/inspections')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{inspection.inspection_templates?.name}</h1>
            {getCategoryBadge(inspection.inspection_templates?.category)}
            {getStatusBadge(inspection.status)}
          </div>
          <p className="text-muted-foreground">{inspection.sites?.name}</p>
        </div>
        
        {/* PDF Button - only show when completed */}
        {isReadOnly && (
          <Button 
            variant="outline" 
            onClick={handleGeneratePDF}
            disabled={isGeneratingPDF}
          >
            {isGeneratingPDF ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            {isGeneratingPDF ? t('reports.generating') : t('reports.downloadPdf')}
          </Button>
        )}
      </div>

      {/* Read-only Alert */}
      {isReadOnly && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{t('inspections.detail.readOnly')}</AlertDescription>
        </Alert>
      )}

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
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('inspections.detail.progress')}</p>
                <p className="font-medium">
                  {progress.completed} / {progress.total} {t('templates.items')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Checklist */}
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle>{t('inspections.checklist')}</CardTitle>
        </CardHeader>
        <CardContent>
          {templateItems && templateItems.length > 0 ? (
            <div className="space-y-4">
              {templateItems.map((item, index) => {
                const result = itemResults.get(item.id);
                const photoCount = result?.inspectionItemId ? (photosByItem.get(result.inspectionItemId) || 0) : 0;
                
                return (
                  <ChecklistItem
                    key={item.id}
                    index={index}
                    templateItem={item}
                    inspectionItem={result ? {
                      id: result.inspectionItemId,
                      result: result.result,
                      notes: result.notes,
                      template_item_id: item.id,
                    } : null}
                    onResultChange={handleResultChange}
                    onAddPhoto={handleAddPhoto}
                    photoCount={photoCount}
                    isReadOnly={isReadOnly}
                    hasError={validationErrors.has(item.id)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t('templates.noItems')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* General Photos */}
      <InspectionPhotos
        inspectionId={inspectionId!}
        siteId={inspection.site_id}
        photos={generalPhotos}
        isReadOnly={isReadOnly}
      />

      {/* Sticky Action Bar */}
      {!isReadOnly && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t p-4 flex justify-end gap-3 z-50">
          <Button 
            variant="outline" 
            onClick={() => saveDraftMutation.mutate()}
            disabled={saveDraftMutation.isPending}
          >
            {saveDraftMutation.isPending ? t('common.loading') : t('inspections.detail.saveDraft')}
          </Button>
          <Button 
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="bg-gradient-to-r from-primary to-accent"
          >
            {completeMutation.isPending ? t('common.loading') : t('inspections.detail.completeInspection')}
          </Button>
        </div>
      )}

      {/* NC Modal */}
      {ncInspectionItemId && (
        <CreateNCFromItem
          open={ncModalOpen}
          onOpenChange={setNcModalOpen}
          inspectionId={inspectionId!}
          inspectionItemId={ncInspectionItemId}
          siteId={inspection.site_id}
          itemTitle={ncItemTitle}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['nonconformities', inspectionId] });
          }}
        />
      )}

      {/* Photo Upload Modal */}
      {photoInspectionItemId && (
        <PhotoUploadModal
          open={photoModalOpen}
          onOpenChange={setPhotoModalOpen}
          inspectionId={inspectionId!}
          inspectionItemId={photoInspectionItemId}
          siteId={inspection.site_id}
          itemTitle={photoItemTitle}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['inspection-evidence', inspectionId] });
          }}
        />
      )}
    </div>
  );
}
