import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeNoisy } from '@/lib/invokeNoisy';
import type { CrossFinding } from '@/pages/app/incompaticheck/types';

interface CrossProgress { active: boolean; parAtual: string | null; index: number; total: number; }
const IDLE: CrossProgress = { active: false, parAtual: null, index: 0, total: 0 };

export function useCrossAnalysis(obraId: string | null, refreshSignal?: number) {
  const [findings, setFindings] = useState<CrossFinding[]>([]);
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [progress, setProgress] = useState<CrossProgress>(IDLE);
  const [running, setRunning] = useState(false);
  const [crossError, setCrossError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!obraId) { setFindings([]); setEspecialidades([]); return; }

    const { data: f } = await (supabase as any)
      .from('incompaticheck_cross_findings').select('*').eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    setFindings((f || []) as CrossFinding[]);

    const { data: els } = await (supabase as any)
      .from('incompaticheck_elements').select('especialidade').eq('obra_id', obraId);
    const set = new Set<string>();
    (els || []).forEach((r: { especialidade: string }) => { if (r.especialidade) set.add(r.especialidade); });
    setEspecialidades(Array.from(set).sort());
  }, [obraId]);

  useEffect(() => { loadData(); }, [loadData, refreshSignal]);

  const computePairs = useCallback((): [string, string][] => {
    const pairs: [string, string][] = [];
    for (let i = 0; i < especialidades.length; i++) {
      for (let j = i + 1; j < especialidades.length; j++) {
        pairs.push([especialidades[i], especialidades[j]]);
      }
    }
    return pairs;
  }, [especialidades]);

  const runSinglePair = useCallback(async (a: string, b: string) => {
    if (!obraId) return;
    setCrossError(null);
    setProgress({ active: true, parAtual: `${a} × ${b}`, index: 1, total: 1 });
    try {
      await invokeNoisy('incompaticheck-cross-analyze', { obra_id: obraId, especialidade_a: a, especialidade_b: b });
      await loadData();
    } catch (err: any) {
      setCrossError(`Cruzamento "${a} × ${b}" falhou: ${err.message}`);
      await loadData();
      throw err;
    } finally {
      setProgress(IDLE);
    }
  }, [obraId, loadData]);

  const runCrossAnalysis = useCallback(async () => {
    if (!obraId) return;
    const pairs = computePairs();
    if (pairs.length === 0) return;
    setRunning(true);
    setCrossError(null);
    try {
      for (let i = 0; i < pairs.length; i++) {
        const [a, b] = pairs[i];
        setProgress({ active: true, parAtual: `${a} × ${b}`, index: i + 1, total: pairs.length });
        await invokeNoisy('incompaticheck-cross-analyze', { obra_id: obraId, especialidade_a: a, especialidade_b: b });
        await loadData();
      }
    } catch (err: any) {
      setCrossError(err.message);
      await loadData();
    } finally {
      setProgress(IDLE);
      setRunning(false);
    }
  }, [obraId, computePairs, loadData]);

  const updateFindingStatus = useCallback(async (id: string, status: 'confirmado' | 'rejeitado') => {
    const { error } = await (supabase as any)
      .from('incompaticheck_cross_findings').update({ status }).eq('id', id);
    if (error) throw new Error(`Erro ao atualizar estado: ${error.message}`);
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status } : f));
  }, []);

  return {
    findings, especialidades, progress, running, crossError,
    setCrossError,
    clearError: () => setCrossError(null),
    loadData, computePairs, runCrossAnalysis, runSinglePair, updateFindingStatus,
  };
}
