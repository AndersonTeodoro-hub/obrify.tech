import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Trash2, 
  AlertTriangle,
  Info,
  Loader2,
  Sparkles
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ImageViewerWithZoom } from './ImageViewerWithZoom';
import { PanoramaViewer } from './PanoramaViewer';
import { CaptureInfoPanel } from './CaptureInfoPanel';
import { CreateNCModal, type NCPrefillData } from './CreateNCModal';
import { AIAnalysisPanel } from './AIAnalysisPanel';
import { SilvaAnalysisButton } from './SilvaAnalysisButton';
import { SilvaAssessmentPanel } from './SilvaAssessmentPanel';
import type { CaptureWithDetails, AIAnalysisResult, AIDetection } from '@/types/captures';
import { SOURCE_TO_CATEGORY } from '@/types/captures';
import { cn } from '@/lib/utils';

interface CaptureViewerProps {
  capture: CaptureWithDetails | null;
  captures: CaptureWithDetails[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (capture: CaptureWithDetails) => void;
  onDelete?: (capture: CaptureWithDetails) => void;
}

export function CaptureViewer({
  capture,
  captures,
  open,
  onOpenChange,
  onNavigate,
  onDelete,
}: CaptureViewerProps) {
  const { t } = useTranslation();
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showNCModal, setShowNCModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  
  // AI Analysis states
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResults, setAiResults] = useState<AIAnalysisResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [ncPrefillData, setNcPrefillData] = useState<NCPrefillData | null>(null);
  const [lastAnalysisType, setLastAnalysisType] = useState<'defects' | 'rebar' | 'general'>('defects');
  const [showSilvaPanel, setShowSilvaPanel] = useState(false);
  const [silvaRefreshTrigger, setSilvaRefreshTrigger] = useState(0);

  const currentIndex = capture ? captures.findIndex((c) => c.id === capture.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < captures.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(captures[currentIndex - 1]);
    }
  }, [hasPrev, captures, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      onNavigate(captures[currentIndex + 1]);
    }
  }, [hasNext, captures, currentIndex, onNavigate]);

  // Load signed URL when capture changes
  useEffect(() => {
    if (!capture || !open) {
      setImageUrl(null);
      return;
    }

    const loadSignedUrl = async () => {
      setIsLoadingUrl(true);
      try {
        const { data, error } = await supabase.storage
          .from('captures')
          .createSignedUrl(capture.file_path, 3600); // 1 hour expiry

        if (error) {
          console.error('Error creating signed URL:', error);
          // Fallback to placeholder
          setImageUrl('https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop');
        } else {
          setImageUrl(data.signedUrl);
        }
      } catch (err) {
        console.error('Failed to load image:', err);
        setImageUrl('https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=800&fit=crop');
      } finally {
        setIsLoadingUrl(false);
      }
    };

    loadSignedUrl();
  }, [capture, open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onOpenChange(false);
          break;
        case 'ArrowLeft':
          goToPrev();
          break;
        case 'ArrowRight':
          goToNext();
          break;
        case 'i':
        case 'I':
          setShowInfoPanel((prev) => !prev);
          break;
        case 'd':
        case 'D':
          if (!e.ctrlKey && !e.metaKey) {
            handleDownload();
          }
          break;
        case 'Delete':
          setShowDeleteDialog(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, goToPrev, goToNext, onOpenChange]);

  const handleDownload = async () => {
    if (!capture || !imageUrl) return;
    
    setIsDownloading(true);
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = capture.file_path.split('/').pop() || 'capture';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast({
        title: t('captures.viewer.downloadStarted'),
        description: capture.capture_point.code,
      });
    } catch (err) {
      toast({
        title: t('common.error'),
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!capture) return;
    
    setIsDeleting(true);
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('captures')
        .remove([capture.file_path]);

      if (storageError) {
        throw new Error(storageError.message);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('captures')
        .delete()
        .eq('id', capture.id);

      if (dbError) {
        throw new Error(dbError.message);
      }

      toast({
        title: t('captures.viewer.deleteSuccess'),
      });

      setShowDeleteDialog(false);
      onDelete?.(capture);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: t('common.error'),
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // AI Analysis handler
  const handleAIAnalysis = async (analysisType: 'defects' | 'rebar' | 'general') => {
    if (!capture) return;
    
    setIsAnalyzing(true);
    setAiError(null);
    setShowAIPanel(true);
    setShowInfoPanel(false);
    setLastAnalysisType(analysisType);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-image-analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            capture_id: capture.id,
            analysis_type: analysisType,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const results = await response.json();
      setAiResults(results);
      
      // Mark capture as analyzed
      await supabase
        .from('captures')
        .update({ 
          ai_analyzed: true, 
          ai_analyzed_at: new Date().toISOString() 
        })
        .eq('id', capture.id);

      toast({
        title: t('captures.ai.analysisComplete'),
        description: `${results.detections.length} ${t('captures.ai.detections').toLowerCase()}`,
      });
        
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setAiError(errorMessage);
      toast({
        title: t('captures.ai.analysisError'),
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateNCFromDetection = (detection: AIDetection) => {
    const severityMap: Record<string, string> = {
      critical: 'critical',
      major: 'high',
      minor: 'medium',
      observation: 'low',
    };
    
    setNcPrefillData({
      title: `${detection.type}: ${detection.description.slice(0, 50)}`,
      description: `${detection.description}\n\n${t('captures.ai.location')}: ${detection.location}\n${t('captures.ai.confidence')}: ${Math.round(detection.confidence * 100)}%`,
      severity: severityMap[detection.severity] || 'medium',
    });
    setShowNCModal(true);
  };

  const handleRetryAnalysis = () => {
    handleAIAnalysis(lastAnalysisType);
  };

  if (!capture) return null;

  const category = SOURCE_TO_CATEGORY[capture.source_type];
  const isPanorama = category === 'panorama';
  const isVideo = category === 'video';
  const canAnalyze = !isPanorama && !isVideo && imageUrl;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 bg-black border-none rounded-none">
          {/* Top Toolbar */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            {/* Left: Counter */}
            <div className="text-white/80 text-sm font-medium">
              {currentIndex + 1} {t('common.of')} {captures.length}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {/* AI Analysis Dropdown */}
              {canAnalyze && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      disabled={isAnalyzing}
                      title={t('captures.ai.analyzeWithAI')}
                    >
                      {isAnalyzing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Sparkles className="w-5 h-5" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleAIAnalysis('defects')}>
                      {t('captures.ai.detectDefects')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAIAnalysis('rebar')}>
                      {t('captures.ai.verifyRebar')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAIAnalysis('general')}>
                      {t('captures.ai.generalAnalysis')}
                    </DropdownMenuItem>
                    <SilvaAnalysisButton
                      captureId={capture.id}
                      filePath={capture.file_path}
                      siteName={capture.capture_point.area.floor.site.name}
                      floorName={capture.capture_point.area.floor.name}
                      areaName={capture.capture_point.area.name}
                      pointCode={capture.capture_point.code}
                      capturedAt={capture.captured_at}
                      disabled={isAnalyzing}
                      onAnalysisComplete={() => {
                        setSilvaRefreshTrigger((n) => n + 1);
                        setShowSilvaPanel(true);
                        setShowInfoPanel(false);
                        setShowAIPanel(false);
                      }}
                    />
                    <DropdownMenuItem onClick={() => {
                      setShowSilvaPanel(true);
                      setShowInfoPanel(false);
                      setShowAIPanel(false);
                    }}>
                      Ver Pareceres Silva
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => {
                  setShowInfoPanel((prev) => !prev);
                  setShowAIPanel(false);
                  setShowSilvaPanel(false);
                }}
                title={showInfoPanel ? t('captures.viewer.hideInfo') : t('captures.viewer.showInfo')}
              >
                <Info className="w-5 h-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={handleDownload}
                disabled={isDownloading || !imageUrl}
                title={t('captures.download')}
              >
                {isDownloading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => {
                  setNcPrefillData(null);
                  setShowNCModal(true);
                }}
                title={t('captures.viewer.createNC')}
              >
                <AlertTriangle className="w-5 h-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:bg-destructive/20"
                onClick={() => setShowDeleteDialog(true)}
                title={t('captures.viewer.deleteCapture')}
              >
                <Trash2 className="w-5 h-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 ml-2"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-6 h-6" />
              </Button>
            </div>
          </div>

          {/* Navigation buttons */}
          {hasPrev && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-40 text-white hover:bg-white/20 h-14 w-14"
              onClick={goToPrev}
            >
              <ChevronLeft className="w-10 h-10" />
            </Button>
          )}
          {hasNext && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-40 text-white hover:bg-white/20 h-14 w-14"
              onClick={goToNext}
              style={{ right: (showInfoPanel || showAIPanel || showSilvaPanel) ? '336px' : '16px' }}
            >
              <ChevronRight className="w-10 h-10" />
            </Button>
          )}

          {/* Main content area */}
          <div 
            className={cn(
              "flex h-full transition-all duration-300",
              (showInfoPanel || showAIPanel || showSilvaPanel) ? "mr-80" : ""
            )}
          >
            <div className="flex-1 flex items-center justify-center p-16 pt-20 pb-8">
              {isLoadingUrl ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                  <p className="text-white/70">{t('common.loading')}</p>
                </div>
              ) : imageUrl ? (
                <>
                  {isPanorama ? (
                    <PanoramaViewer src={imageUrl} className="w-full h-full" />
                  ) : isVideo ? (
                    <video
                      src={imageUrl}
                      className="max-w-full max-h-full object-contain"
                      controls
                      autoPlay
                    />
                  ) : (
                    <ImageViewerWithZoom
                      src={imageUrl}
                      alt={capture.capture_point.code}
                      className="w-full h-full"
                    />
                  )}
                </>
              ) : (
                <p className="text-white/50">{t('common.error')}</p>
              )}
            </div>

            {/* Info Panel */}
            {showInfoPanel && !showAIPanel && (
              <CaptureInfoPanel
                capture={capture}
                onClose={() => setShowInfoPanel(false)}
                className="absolute right-0 top-0 bottom-0"
              />
            )}

            {/* AI Analysis Panel */}
            {showAIPanel && !showSilvaPanel && (
              <AIAnalysisPanel
                isLoading={isAnalyzing}
                results={aiResults}
                error={aiError}
                onClose={() => setShowAIPanel(false)}
                onCreateNC={handleCreateNCFromDetection}
                onRetry={handleRetryAnalysis}
                className="absolute right-0 top-0 bottom-0"
              />
            )}

            {/* Silva Assessment Panel */}
            {showSilvaPanel && (
              <SilvaAssessmentPanel
                captureId={capture.id}
                refreshTrigger={silvaRefreshTrigger}
                onClose={() => setShowSilvaPanel(false)}
                className="absolute right-0 top-0 bottom-0"
              />
            )}
          </div>

          {/* Bottom info bar - only when panels are hidden */}
          {!showInfoPanel && !showAIPanel && !showSilvaPanel && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
              <div className="max-w-2xl mx-auto text-center text-white">
                <h3 className="font-semibold">{capture.capture_point.code}</h3>
                <p className="text-sm text-white/70">
                  {capture.capture_point.area.floor.site.name} • {capture.capture_point.area.floor.name} • {capture.capture_point.area.name}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('captures.viewer.deleteCapture')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('captures.viewer.deleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create NC Modal */}
      {capture && (
        <CreateNCModal
          capture={capture}
          open={showNCModal}
          onOpenChange={(open) => {
            setShowNCModal(open);
            if (!open) setNcPrefillData(null);
          }}
          prefillData={ncPrefillData}
        />
      )}
    </>
  );
}
