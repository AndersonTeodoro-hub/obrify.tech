import { useEffect, useState } from 'react';
import { X, GraduationCap, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface Assessment {
  id: string;
  assessment_text: string;
  severity: string | null;
  findings: any[];
  recommendations: any[];
  documents_consulted: any[];
  ai_model: string | null;
  created_at: string;
}

interface SilvaAssessmentPanelProps {
  captureId: string;
  refreshTrigger?: number;
  onClose: () => void;
  className?: string;
}

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: 'Crítico', className: 'bg-red-500/20 text-red-500 border-red-500/30' },
  major: { label: 'Major', className: 'bg-orange-500/20 text-orange-500 border-orange-500/30' },
  minor: { label: 'Minor', className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' },
  observation: { label: 'Observação', className: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
};

export function SilvaAssessmentPanel({
  captureId,
  refreshTrigger,
  onClose,
  className,
}: SilvaAssessmentPanelProps) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAssessments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('capture_silva_assessments')
      .select('id, assessment_text, severity, findings, recommendations, documents_consulted, ai_model, created_at')
      .eq('capture_id', captureId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAssessments(data as Assessment[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAssessments();
  }, [captureId, refreshTrigger]);

  return (
    <div className={cn('w-80 bg-background/95 backdrop-blur-sm border-l border-border flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-sm text-foreground">Pareceres Eng. Silva</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadAssessments} title="Actualizar">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">A carregar pareceres...</p>
            </div>
          ) : assessments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <GraduationCap className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Sem pareceres do Eng. Silva para esta captura.
              </p>
              <p className="text-xs text-muted-foreground">
                Use o botão "Parecer Eng. Silva" para solicitar uma análise.
              </p>
            </div>
          ) : (
            assessments.map((assessment) => {
              const severityInfo = assessment.severity
                ? SEVERITY_CONFIG[assessment.severity]
                : null;

              return (
                <div key={assessment.id} className="rounded-lg border border-border bg-card p-3 space-y-3">
                  {/* Header: severidade + data */}
                  <div className="flex items-center justify-between">
                    {severityInfo ? (
                      <Badge className={severityInfo.className}>
                        {severityInfo.label}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Análise</Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(assessment.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                    </span>
                  </div>

                  {/* Texto do parecer */}
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {assessment.assessment_text}
                  </div>

                  {/* Findings estruturados (se existirem) */}
                  {assessment.findings && assessment.findings.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Detec��ões</p>
                      <div className="space-y-1">
                        {assessment.findings.map((finding: any, i: number) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span className="text-foreground">
                              {typeof finding === 'string' ? finding : finding.description || JSON.stringify(finding)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recomendações (se existirem) */}
                  {assessment.recommendations && assessment.recommendations.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Recomendações</p>
                      <div className="space-y-1">
                        {assessment.recommendations.map((rec: any, i: number) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs">
                            <span className="text-blue-500 mt-0.5">→</span>
                            <span className="text-foreground">
                              {typeof rec === 'string' ? rec : rec.text || JSON.stringify(rec)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Documentos consultados */}
                  {assessment.documents_consulted && assessment.documents_consulted.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Documentos consultados</p>
                      <div className="flex flex-wrap gap-1">
                        {assessment.documents_consulted.map((doc: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-[10px]">
                            {typeof doc === 'string' ? doc : doc.document_name || JSON.stringify(doc)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
