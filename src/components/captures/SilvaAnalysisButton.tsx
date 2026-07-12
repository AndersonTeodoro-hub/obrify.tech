import { useState } from 'react';
import { Loader2, GraduationCap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { toBase64UnderLimit } from '@/lib/capture-image';

interface SilvaAnalysisProps {
  captureId: string;
  filePath: string;
  siteName?: string;
  floorName?: string;
  areaName?: string;
  pointCode?: string;
  fase?: string;
  especialidade?: string;
  nivelLabel?: string;
  capturedAt: string | null;
  notes?: string;
  onAnalysisComplete?: () => void;
  disabled?: boolean;
}

export function SilvaAnalysisButton({
  captureId,
  filePath,
  siteName,
  floorName,
  areaName,
  pointCode,
  fase,
  especialidade,
  nivelLabel,
  capturedAt,
  notes,
  onAnalysisComplete,
  disabled,
}: SilvaAnalysisProps) {
  const { user } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalysis = async () => {
    if (!user || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      // 1. Descarregar foto do bucket captures
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('captures')
        .download(filePath);

      if (downloadError || !fileData) {
        throw new Error('Não foi possível descarregar a foto');
      }

      // 2. Converter para base64, comprimir se necessário (util partilhado)
      const base64 = await toBase64UnderLimit(fileData);

      // 3. Buscar obra_id da memória do Silva (se disponível)
      let obraId: string | null = null;
      try {
        const { data: memData } = await supabase.functions.invoke('eng-silva-memory', {
          body: { action: 'load' },
        });
        obraId = memData?.profile?.current_obra_id || null;
      } catch {
        // Continuar sem obra_id — Silva funciona mas sem PDFs do projecto
      }

      // 4. Montar prompt contextualizado
      const dateStr = capturedAt
        ? new Date(capturedAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Data desconhecida';

      const localParts = [siteName, floorName, areaName, pointCode].filter(Boolean);
      const prompt = [
        'Analisa esta fotografia de fiscalização de obra.',
        `Local: ${localParts.length ? localParts.join(' > ') : '—'}.`,
        especialidade ? `Especialidade: ${especialidade}.` : '',
        fase ? `Fase: ${fase}.` : '',
        nivelLabel ? `Nível: ${nivelLabel}.` : '',
        `Data: ${dateStr}.`,
        notes ? `Notas: ${notes}.` : '',
        'Dá o teu parecer técnico:',
        '1) O que observas',
        '2) Conformidade com o projecto',
        '3) Anomalias detectadas',
        '4) Acções recomendadas',
        '5) Nível de urgência (Crítico/Major/Minor/Observação)',
      ].filter(Boolean).join('\n');

      // 5. Chamar eng-silva-chat
      const { data: chatData, error: chatError } = await supabase.functions.invoke('eng-silva-chat', {
        body: {
          message: prompt,
          image: base64,
          mode: 'texto',
          obra_id: obraId,
          user_id: user.id,
          conversation_history: [],
        },
      });

      if (chatError || !chatData?.reply) {
        throw new Error(chatError?.message || 'Eng. Silva não respondeu');
      }

      const reply: string = chatData.reply;

      // 6. Extrair severidade do texto
      let severity: string | null = null;
      const severityMatch = reply.toLowerCase();
      if (severityMatch.includes('crítico') || severityMatch.includes('critico')) severity = 'critical';
      else if (severityMatch.includes('major') || severityMatch.includes('grave')) severity = 'major';
      else if (severityMatch.includes('minor') || severityMatch.includes('menor')) severity = 'minor';
      else if (severityMatch.includes('observação') || severityMatch.includes('observacao')) severity = 'observation';

      // 7. Guardar parecer na BD
      const { error: insertError } = await supabase
        .from('capture_silva_assessments')
        .insert({
          capture_id: captureId,
          user_id: user.id,
          obra_id: obraId || null,
          assessment_text: reply,
          severity,
          prompt_used: prompt,
        });

      if (insertError) {
        console.error('Erro ao guardar parecer:', insertError);
        toast.error('Erro ao guardar parecer: ' + insertError.message);
      } else {
        toast.success('Parecer do Eng. Silva concluído');
        onAnalysisComplete?.();
      }
    } catch (err: any) {
      console.error('Silva analysis error:', err);
      toast.error('Erro na análise: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <button
      onClick={handleAnalysis}
      disabled={disabled || isAnalyzing}
      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isAnalyzing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <GraduationCap className="w-4 h-4" />
      )}
      {isAnalyzing ? 'Eng. Silva a analisar...' : 'Parecer Eng. Silva'}
    </button>
  );
}
