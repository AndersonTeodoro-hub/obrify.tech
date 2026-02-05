import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Check, Building2, ClipboardList, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';

interface NewInspectionWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (inspectionId: string) => void;
}

const STEPS = [
  { id: 1, icon: Building2, key: 'step1' },
  { id: 2, icon: ClipboardList, key: 'step2' },
  { id: 3, icon: CheckCircle, key: 'step3' },
];

export function NewInspectionWizard({ open, onOpenChange, onSuccess }: NewInspectionWizardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  
  // Step 1 state
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [selectedPoint, setSelectedPoint] = useState<string>('');
  
  // Step 2 state
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setSelectedSite('');
      setSelectedFloor('');
      setSelectedArea('');
      setSelectedPoint('');
      setSelectedTemplate('');
    }
  }, [open]);

  // Fetch sites
  const { data: sites } = useQuery({
    queryKey: ['sites-for-wizard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch floors for selected site
  const { data: floors } = useQuery({
    queryKey: ['floors-for-wizard', selectedSite],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('floors')
        .select('id, name, level')
        .eq('site_id', selectedSite)
        .order('level');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSite,
  });

  // Fetch areas for selected floor
  const { data: areas } = useQuery({
    queryKey: ['areas-for-wizard', selectedFloor],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('areas')
        .select('id, name')
        .eq('floor_id', selectedFloor)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedFloor,
  });

  // Fetch capture points for selected area
  const { data: points } = useQuery({
    queryKey: ['points-for-wizard', selectedArea],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('capture_points')
        .select('id, code')
        .eq('area_id', selectedArea)
        .order('code');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedArea,
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['templates-for-wizard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspection_templates')
        .select(`
          id, 
          name, 
          category,
          inspection_template_items(count)
        `)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: open && currentStep >= 2,
  });

  // Create inspection mutation
  const createInspection = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .insert({
          site_id: selectedSite,
          template_id: selectedTemplate,
          created_by: user?.id,
          floor_id: selectedFloor || null,
          area_id: selectedArea || null,
          capture_point_id: selectedPoint || null,
          status: 'DRAFT',
          scheduled_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: t('inspections.createdSuccessfully'),
      });
      onSuccess(data.id);
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Clear dependent selections when parent changes
  useEffect(() => {
    setSelectedFloor('');
    setSelectedArea('');
    setSelectedPoint('');
  }, [selectedSite]);

  useEffect(() => {
    setSelectedArea('');
    setSelectedPoint('');
  }, [selectedFloor]);

  useEffect(() => {
    setSelectedPoint('');
  }, [selectedArea]);

  const canProceedStep1 = !!selectedSite;
  const canProceedStep2 = !!selectedTemplate;

  const getCategoryColor = (category: string | null) => {
    const colors: Record<string, string> = {
      structure: 'bg-blue-500/20 text-blue-400',
      finishes: 'bg-amber-500/20 text-amber-400',
      installations: 'bg-green-500/20 text-green-400',
      safety: 'bg-red-500/20 text-red-400',
    };
    return category ? colors[category] || 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground';
  };

  const getSelectedSiteName = () => sites?.find(s => s.id === selectedSite)?.name || '';
  const getSelectedFloorName = () => floors?.find(f => f.id === selectedFloor)?.name || '';
  const getSelectedAreaName = () => areas?.find(a => a.id === selectedArea)?.name || '';
  const getSelectedPointCode = () => points?.find(p => p.id === selectedPoint)?.code || '';
  const getSelectedTemplate = () => templates?.find(t => t.id === selectedTemplate);

  const getLocationString = () => {
    const parts = [];
    if (selectedFloor) parts.push(getSelectedFloorName());
    if (selectedArea) parts.push(getSelectedAreaName());
    if (selectedPoint) parts.push(getSelectedPointCode());
    return parts.length > 0 ? parts.join(' > ') : t('inspections.general');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('inspections.wizard.title')}</DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-4">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  currentStep >= step.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {currentStep > step.id ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <step.icon className="w-5 h-5" />
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-2 transition-colors ${
                    currentStep > step.id ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px] py-4">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium">{t('inspections.wizard.step1Title')}</h3>
                <p className="text-sm text-muted-foreground">{t('inspections.wizard.step1Desc')}</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('inspections.site')} *</Label>
                  <Select value={selectedSite} onValueChange={setSelectedSite}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('inspections.wizard.selectSite')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedSite && (
                  <div className="space-y-4 pt-2 border-t">
                    <Label className="text-muted-foreground">{t('inspections.wizard.optionalLocation')}</Label>
                    
                    <div className="space-y-2">
                      <Label>{t('siteDetail.floors')}</Label>
                      <Select value={selectedFloor} onValueChange={setSelectedFloor}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('common.all')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">{t('common.all')}</SelectItem>
                          {floors?.map((floor) => (
                            <SelectItem key={floor.id} value={floor.id}>
                              {floor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedFloor && areas && areas.length > 0 && (
                      <div className="space-y-2">
                        <Label>{t('siteDetail.areas')}</Label>
                        <Select value={selectedArea} onValueChange={setSelectedArea}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('common.all')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t('common.all')}</SelectItem>
                            {areas.map((area) => (
                              <SelectItem key={area.id} value={area.id}>
                                {area.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {selectedArea && points && points.length > 0 && (
                      <div className="space-y-2">
                        <Label>{t('siteDetail.points')}</Label>
                        <Select value={selectedPoint} onValueChange={setSelectedPoint}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('common.all')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t('common.all')}</SelectItem>
                            {points.map((point) => (
                              <SelectItem key={point.id} value={point.id}>
                                {point.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium">{t('inspections.wizard.step2Title')}</h3>
                <p className="text-sm text-muted-foreground">{t('inspections.wizard.step2Desc')}</p>
              </div>

              <RadioGroup value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <div className="grid gap-3 max-h-[250px] overflow-y-auto pr-2">
                  {templates?.map((template) => (
                    <Label
                      key={template.id}
                      htmlFor={template.id}
                      className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedTemplate === template.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <RadioGroupItem value={template.id} id={template.id} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{template.name}</span>
                          <Badge className={getCategoryColor(template.category)}>
                            {template.category ? t(`templates.categories.${template.category}`) : '-'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {template.inspection_template_items?.[0]?.count || 0} {t('templates.items')}
                        </p>
                      </div>
                    </Label>
                  ))}
                </div>
              </RadioGroup>

              {templates?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {t('templates.noTemplates')}
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium">{t('inspections.wizard.step3Title')}</h3>
                <p className="text-sm text-muted-foreground">{t('inspections.wizard.step3Desc')}</p>
              </div>

              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('inspections.site')}:</span>
                    <span className="font-medium">{getSelectedSiteName()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('inspections.location')}:</span>
                    <span className="font-medium">{getLocationString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('inspections.template')}:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{getSelectedTemplate()?.name}</span>
                      <Badge className={getCategoryColor(getSelectedTemplate()?.category || null)}>
                        {getSelectedTemplate()?.category ? t(`templates.categories.${getSelectedTemplate()?.category}`) : '-'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('inspections.status')}:</span>
                    <Badge variant="secondary">{t('inspections.statusDraft')}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              if (currentStep === 1) {
                onOpenChange(false);
              } else {
                setCurrentStep(currentStep - 1);
              }
            }}
          >
            {currentStep === 1 ? t('common.cancel') : t('common.back')}
          </Button>

          {currentStep < 3 ? (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={currentStep === 1 ? !canProceedStep1 : !canProceedStep2}
            >
              {t('common.next')}
            </Button>
          ) : (
            <Button
              onClick={() => createInspection.mutate()}
              disabled={createInspection.isPending}
            >
              {createInspection.isPending ? t('common.loading') : t('inspections.createInspection')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
