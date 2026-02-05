import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale';
import { 
  FileText, 
  Download, 
  AlertTriangle, 
  ClipboardCheck, 
  Clock,
  Loader2,
  Calendar,
  Building2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  generateInspectionReport, 
  generateOpenNCsReport, 
  generateNCHistoryReport 
} from '@/services/pdfGenerator';

export default function Reports() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  
  // State for filters and loading
  const [inspectionSiteFilter, setInspectionSiteFilter] = useState<string>('all');
  const [ncSiteFilter, setNCFilter] = useState<string>('');
  const [historySiteFilter, setHistorySiteFilter] = useState<string>('');
  const [historyStartDate, setHistoryStartDate] = useState<string>(
    format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
  );
  const [historyEndDate, setHistoryEndDate] = useState<string>(
    format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
  );
  const [generatingReport, setGeneratingReport] = useState<Record<string, boolean>>({});

  // Fetch user's organization
  const { data: membership } = useQuery({
    queryKey: ['user-membership'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      
      return data;
    },
  });

  // Fetch sites
  const { data: sites } = useQuery({
    queryKey: ['sites', membership?.org_id],
    queryFn: async () => {
      if (!membership?.org_id) return [];
      
      const { data, error } = await supabase
        .from('sites')
        .select('id, name')
        .eq('org_id', membership.org_id)
        .order('name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!membership?.org_id,
  });

  // Fetch completed inspections
  const { data: completedInspections, isLoading: inspectionsLoading } = useQuery({
    queryKey: ['completed-inspections', membership?.org_id, inspectionSiteFilter],
    queryFn: async () => {
      if (!membership?.org_id) return [];
      
      let query = supabase
        .from('inspections')
        .select(`
          id,
          status,
          scheduled_at,
          created_at,
          sites!inspections_site_id_fkey(id, name),
          inspection_templates!inspections_template_id_fkey(id, name)
        `)
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (inspectionSiteFilter && inspectionSiteFilter !== 'all') {
        query = query.eq('site_id', inspectionSiteFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!membership?.org_id,
  });

  // Fetch generated reports (documents with report types)
  const { data: generatedReports, isLoading: reportsLoading } = useQuery({
    queryKey: ['generated-reports', membership?.org_id],
    queryFn: async () => {
      if (!membership?.org_id) return [];
      
      const { data, error } = await supabase
        .from('documents')
        .select(`
          id,
          name,
          file_path,
          doc_type,
          created_at,
          sites!documents_site_id_fkey(id, name)
        `)
        .eq('org_id', membership.org_id)
        .in('doc_type', ['inspection_report', 'nc_open_list', 'nc_history', 'measurement_auto'])
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    enabled: !!membership?.org_id,
  });

  // Helper to upload PDF and save document record
  const saveReportToStorage = async (
    blob: Blob,
    fileName: string,
    docType: string,
    siteId: string,
    displayName: string
  ) => {
    if (!membership?.org_id) throw new Error('No organization');
    
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const filePath = `reports/${siteId}/${fileName}`;
    
    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, { upsert: true });
    
    if (uploadError) throw uploadError;
    
    // Save document record
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        name: displayName,
        file_path: filePath,
        doc_type: docType,
        site_id: siteId,
        org_id: membership.org_id,
      });
    
    if (dbError) throw dbError;
    
    return filePath;
  };

  // Helper to download blob
  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle inspection PDF generation
  const handleGenerateInspectionPDF = async (inspectionId: string, siteName: string, siteId: string) => {
    setGeneratingReport(prev => ({ ...prev, [inspectionId]: true }));
    
    try {
      const blob = await generateInspectionReport(inspectionId);
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const fileName = `inspecao_${siteName.toLowerCase().replace(/\s+/g, '-')}_${dateStr}.pdf`;
      const displayName = `${t('reportsPage.types.inspection_report')} - ${siteName} - ${format(new Date(), 'dd/MM/yyyy')}`;
      
      await saveReportToStorage(blob, fileName, 'inspection_report', siteId, displayName);
      downloadBlob(blob, fileName);
      
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
      toast({ title: t('reportsPage.reportSaved') });
    } catch (error) {
      toast({ 
        title: t('common.error'), 
        description: String(error), 
        variant: 'destructive' 
      });
    } finally {
      setGeneratingReport(prev => ({ ...prev, [inspectionId]: false }));
    }
  };

  // Handle open NCs PDF generation
  const handleGenerateOpenNCsPDF = async () => {
    if (!ncSiteFilter) {
      toast({ title: t('reportsPage.selectSite'), variant: 'destructive' });
      return;
    }
    
    const site = sites?.find(s => s.id === ncSiteFilter);
    if (!site) return;
    
    setGeneratingReport(prev => ({ ...prev, openNCs: true }));
    
    try {
      const blob = await generateOpenNCsReport(ncSiteFilter);
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const fileName = `ncs_abertas_${site.name.toLowerCase().replace(/\s+/g, '-')}_${dateStr}.pdf`;
      const displayName = `${t('reportsPage.types.nc_open_list')} - ${site.name} - ${format(new Date(), 'dd/MM/yyyy')}`;
      
      await saveReportToStorage(blob, fileName, 'nc_open_list', ncSiteFilter, displayName);
      downloadBlob(blob, fileName);
      
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
      toast({ title: t('reportsPage.reportSaved') });
    } catch (error) {
      toast({ 
        title: t('common.error'), 
        description: String(error), 
        variant: 'destructive' 
      });
    } finally {
      setGeneratingReport(prev => ({ ...prev, openNCs: false }));
    }
  };

  // Handle NC history PDF generation
  const handleGenerateNCHistoryPDF = async () => {
    if (!historySiteFilter) {
      toast({ title: t('reportsPage.selectSite'), variant: 'destructive' });
      return;
    }
    
    const site = sites?.find(s => s.id === historySiteFilter);
    if (!site) return;
    
    setGeneratingReport(prev => ({ ...prev, ncHistory: true }));
    
    try {
      const period = {
        start: new Date(historyStartDate),
        end: new Date(historyEndDate),
      };
      
      const blob = await generateNCHistoryReport(historySiteFilter, period);
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const fileName = `historico_ncs_${site.name.toLowerCase().replace(/\s+/g, '-')}_${dateStr}.pdf`;
      const displayName = `${t('reportsPage.types.nc_history')} - ${site.name} - ${format(period.start, 'dd/MM')} a ${format(period.end, 'dd/MM/yyyy')}`;
      
      await saveReportToStorage(blob, fileName, 'nc_history', historySiteFilter, displayName);
      downloadBlob(blob, fileName);
      
      queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
      toast({ title: t('reportsPage.reportSaved') });
    } catch (error) {
      toast({ 
        title: t('common.error'), 
        description: String(error), 
        variant: 'destructive' 
      });
    } finally {
      setGeneratingReport(prev => ({ ...prev, ncHistory: false }));
    }
  };

  // Handle download from history
  const handleDownloadReport = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 60);
      
      if (error) throw error;
      
      const response = await fetch(data.signedUrl);
      const blob = await response.blob();
      downloadBlob(blob, fileName);
    } catch (error) {
      toast({ 
        title: t('common.error'), 
        description: String(error), 
        variant: 'destructive' 
      });
    }
  };

  const getDocTypeLabel = (docType: string) => {
    const typeKey = `reportsPage.types.${docType}`;
    return t(typeKey, docType);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM yyyy HH:mm", { 
      locale: i18n.language === 'pt' ? pt : undefined 
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('reportsPage.title')}</h1>
        <p className="text-muted-foreground">{t('reportsPage.subtitle')}</p>
      </div>

      {/* Section 1: Inspection Reports */}
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            {t('reportsPage.inspectionReports')}
          </CardTitle>
          <CardDescription>{t('reportsPage.inspectionReportsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Select value={inspectionSiteFilter} onValueChange={setInspectionSiteFilter}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder={t('reportsPage.selectSite')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inspections.allSites')}</SelectItem>
                {sites?.map(site => (
                  <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {inspectionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : completedInspections && completedInspections.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inspections.date')}</TableHead>
                  <TableHead>{t('inspections.site')}</TableHead>
                  <TableHead>{t('inspections.template')}</TableHead>
                  <TableHead>{t('inspections.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedInspections.map(inspection => {
                  const site = inspection.sites as { id: string; name: string };
                  const template = inspection.inspection_templates as { name: string };
                  const inspDate = inspection.scheduled_at || inspection.created_at;
                  
                  return (
                    <TableRow key={inspection.id}>
                      <TableCell>
                        {format(new Date(inspDate), 'dd MMM yyyy', { 
                          locale: i18n.language === 'pt' ? pt : undefined 
                        })}
                      </TableCell>
                      <TableCell className="font-medium">{site?.name}</TableCell>
                      <TableCell>{template?.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-primary/20 text-primary">
                          {t('inspections.statusCompleted')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateInspectionPDF(inspection.id, site?.name, site?.id)}
                          disabled={generatingReport[inspection.id]}
                        >
                          {generatingReport[inspection.id] ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <FileText className="w-4 h-4 mr-2" />
                          )}
                          PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ClipboardCheck className="w-12 h-12 mb-2 opacity-50" />
              <p>{t('reportsPage.noCompletedInspections')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: NC Reports */}
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            {t('reportsPage.ncReports')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Open NCs by Site */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('reportsPage.openNCsBySite')}</CardTitle>
                <CardDescription className="text-sm">{t('reportsPage.openNCsBySiteDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={ncSiteFilter} onValueChange={setNCFilter}>
                  <SelectTrigger>
                    <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder={t('reportsPage.selectSite')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sites?.map(site => (
                      <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  className="w-full" 
                  onClick={handleGenerateOpenNCsPDF}
                  disabled={!ncSiteFilter || generatingReport.openNCs}
                >
                  {generatingReport.openNCs ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  {t('reportsPage.generateList')}
                </Button>
              </CardContent>
            </Card>

            {/* NC History */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('reportsPage.ncHistory')}</CardTitle>
                <CardDescription className="text-sm">{t('reportsPage.ncHistoryDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('reportsPage.from')}</Label>
                    <Input 
                      type="date" 
                      value={historyStartDate}
                      onChange={(e) => setHistoryStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('reportsPage.to')}</Label>
                    <Input 
                      type="date"
                      value={historyEndDate}
                      onChange={(e) => setHistoryEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <Select value={historySiteFilter} onValueChange={setHistorySiteFilter}>
                  <SelectTrigger>
                    <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder={t('reportsPage.selectSite')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sites?.map(site => (
                      <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  className="w-full"
                  onClick={handleGenerateNCHistoryPDF}
                  disabled={!historySiteFilter || generatingReport.ncHistory}
                >
                  {generatingReport.ncHistory ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  {t('reportsPage.generateReport')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Measurement Reports (Placeholder) */}
      <Card className="glass border-border/50 opacity-75">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            {t('reportsPage.measurementAutos')}
            <Badge variant="outline" className="ml-2">{t('reportsPage.comingSoon')}</Badge>
          </CardTitle>
          <CardDescription>{t('reportsPage.measurementAutosDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Clock className="w-12 h-12 mb-2 opacity-50" />
            <p>{t('reportsPage.comingSoon')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Report History */}
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('reportsPage.generatedReports')}
          </CardTitle>
          <CardDescription>{t('reportsPage.generatedReportsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : generatedReports && generatedReports.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reportsPage.reportType')}</TableHead>
                  <TableHead>{t('inspections.site')}</TableHead>
                  <TableHead>{t('reportsPage.generatedAt')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {generatedReports.map(report => {
                  const site = report.sites as { name: string } | null;
                  
                  return (
                    <TableRow key={report.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {getDocTypeLabel(report.doc_type || '')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{site?.name || '-'}</TableCell>
                      <TableCell>{formatDate(report.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadReport(report.file_path, report.name)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          {t('reportsPage.download')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mb-2 opacity-50" />
              <p>{t('reportsPage.noReports')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
