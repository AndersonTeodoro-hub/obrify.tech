import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeNoisy } from '@/lib/invokeNoisy';
import type { SelfFinding } from '@/pages/app/incompaticheck/types';

interface SelfProgress { active: boolean; label: string | null; }
const IDLE: SelfProgress = { active: false, label: null };

export function useSelfAnalysis(obraId: string | null, refreshSignal?: number) {
  const [findings, setFindings] = useState<SelfFinding[]>([]);
  const [progress, setProgress] = useState<SelfProgress>(IDLE);
  const [selfError, setSelfError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!obraId) { setFindings([]); return; }
    const { data } = await (supabase as any)
      .from('incompaticheck_self_findings').select('*').eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    setFindings((data || []) as SelfFinding[]);
  }, [obraId]);

  useEffect(() => { loadData(); }, [loadData, refreshSignal]);

  const runProject = useCallback(async (projectId: string, projectName?: string) => {
    setSelfError(null);
    setProgress({ active: true, label: projectName || 'projeto' });
    try {
      await invokeNoisy('incompaticheck-self-analyze', { project_id: projectId });
      await loadData();
    } catch (err: any) {
      setSelfError(`Verificação de coerência${projectName ? ` de "${projectName}"` : ''} falhou: ${err.message}`);
      await loadData();
      throw err;
    } finally {
      setProgress(IDLE);
    }
  }, [loadData]);

  const updateFindingStatus = useCallback(async (id: string, status: 'confirmado' | 'rejeitado') => {
    const { error } = await (supabase as any)
      .from('incompaticheck_self_findings').update({ status }).eq('id', id);
    if (error) throw new Error(`Erro ao atualizar estado: ${error.message}`);
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status } : f));
  }, []);

  return {
    findings, progress, selfError,
    setSelfError,
    clearError: () => setSelfError(null),
    loadData, runProject, updateFindingStatus,
  };
}
