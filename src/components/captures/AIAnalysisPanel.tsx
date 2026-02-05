import { useTranslation } from 'react-i18next';
import { X, Loader2, AlertTriangle, RefreshCw, CheckCircle, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AIAnalysisResult, AIDetection } from '@/types/captures';

interface AIAnalysisPanelProps {
  isLoading: boolean;
  results: AIAnalysisResult | null;
  error: string | null;
  onClose: () => void;
  onCreateNC: (detection: AIDetection) => void;
  onRetry: () => void;
  className?: string;
}

const severityConfig = {
  critical: { 
    bg: 'bg-red-500', 
    text: 'text-white',
    border: 'border-red-500'
  },
  major: { 
    bg: 'bg-orange-500', 
    text: 'text-white',
    border: 'border-orange-500'
  },
  minor: { 
    bg: 'bg-yellow-500', 
    text: 'text-black',
    border: 'border-yellow-500'
  },
  observation: { 
    bg: 'bg-blue-500', 
    text: 'text-white',
    border: 'border-blue-500'
  },
};

export function AIAnalysisPanel({
  isLoading,
  results,
  error,
  onClose,
  onCreateNC,
  onRetry,
  className,
}: AIAnalysisPanelProps) {
  const { t } = useTranslation();

  const canCreateNC = (severity: string) => {
    return severity === 'critical' || severity === 'major';
  };

  return (
    <div className={cn(
      "w-80 bg-background border-l flex flex-col h-full",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-primary" />
          {t('captures.ai.analyzeWithAI')}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {t('captures.ai.analyzing')}
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertTriangle className="w-10 h-10 text-destructive" />
              <p className="text-sm text-muted-foreground text-center">
                {t('captures.ai.analysisError')}
              </p>
              <p className="text-xs text-muted-foreground text-center">
                {error}
              </p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('captures.ai.retry')}
              </Button>
            </div>
          )}

          {/* Results */}
          {results && !isLoading && (
            <>
              {/* Overall Assessment */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    {t('captures.ai.overallAssessment')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {results.overall_assessment}
                  </p>
                </CardContent>
              </Card>

              {/* Detections */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground">
                  {t('captures.ai.detections')} ({results.detections.length})
                </h4>
                
                {results.detections.length === 0 ? (
                  <Card>
                    <CardContent className="py-4">
                      <p className="text-sm text-muted-foreground text-center">
                        {t('captures.ai.noDetections')}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  results.detections.map((detection, index) => {
                    const config = severityConfig[detection.severity] || severityConfig.observation;
                    
                    return (
                      <Card key={index} className={cn("border-l-4", config.border)}>
                        <CardContent className="py-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={cn(config.bg, config.text, "text-xs")}>
                                  {t(`captures.ai.severity.${detection.severity}`)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(detection.confidence * 100)}%
                                </span>
                              </div>
                              <p className="text-sm font-medium capitalize">
                                {detection.type}
                              </p>
                            </div>
                          </div>
                          
                          <p className="text-xs text-muted-foreground">
                            {detection.description}
                          </p>
                          
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">{t('captures.ai.location')}:</span>{' '}
                            {detection.location}
                          </div>

                          {canCreateNC(detection.severity) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-2"
                              onClick={() => onCreateNC(detection)}
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {t('captures.ai.createNC')}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>

              {/* Recommendations */}
              {results.recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      {t('captures.ai.recommendations')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {results.recommendations.map((rec, index) => (
                        <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-primary">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* New Analysis Button */}
              <Button variant="outline" className="w-full" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('captures.ai.newAnalysis')}
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
