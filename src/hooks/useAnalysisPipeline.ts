import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeNoisy } from '@/lib/invokeNoisy';
import type { InventoryRow } from '@/pages/app/incompaticheck/types';

type Stage = 'INVENTORY' | 'EXTRACTION';

interface Progress {
  active: boolean;
  projectId: string | null;
  projectName: string | null;
  stage: Stage | null;
  index: number;
  total: number;
}

interface PipelineProject { id: string; name: string; type: string; }

const IDLE: Progress = { active: false, projectId: null, projectName: null, stage: null, index: 0, total: 0 };

export function useAnalysisPipeline(obraId: string | null, projects: PipelineProject[]) {
  const [inventories, setInventories] = useState<Record<string, InventoryRow>>({});
  const [elementCounts, setElementCounts] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<Progress>(IDLE);
  const [preparing, setPreparing] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const loadPipelineData = useCallback(async () => {
    if (!obraId) { setInventories({}); setElementCounts({}); return; }

    const { data: inv } = await (supabase as any)
      .from('incompaticheck_doc_inventory').select('*').eq('obra_id', obraId);
    const invMap: Record<string, InventoryRow> = {};
    (inv || []).forEach((r: InventoryRow) => { invMap[r.project_id] = r; });
    setInventories(invMap);

    const { data: els } = await (supabase as any)
      .from('incompaticheck_elements').select('project_id').eq('obra_id', obraId);
    const counts: Record<string, number> = {};
    (els || []).forEach((r: { project_id: string }) => { counts[r.project_id] = (counts[r.project_id] || 0) + 1; });
    setElementCounts(counts);
  }, [obraId]);

  useEffect(() => { loadPipelineData(); }, [loadPipelineData]);

  const runInventory = useCallback(async (project: PipelineProject) => {
    setPipelineError(null);
    setProgress({ active: true, projectId: project.id, projectName: project.name, stage: 'INVENTORY', index: 0, total: 1 });
    try {
      await invokeNoisy('incompaticheck-inventory', { project_id: project.id });
      await loadPipelineData();
    } catch (err: any) {
      setPipelineError(`Inventario de "${project.name}" falhou: ${err.message}`);
      await loadPipelineData();
      throw err;
    } finally {
      setProgress(IDLE);
    }
  }, [loadPipelineData]);

  const runExtraction = useCallback(async (project: PipelineProject) => {
    setPipelineError(null);
    setProgress({ active: true, projectId: project.id, projectName: project.name, stage: 'EXTRACTION', index: 0, total: 1 });
    try {
      await invokeNoisy('incompaticheck-extract', { project_id: project.id });
      await loadPipelineData();
    } catch (err: any) {
      setPipelineError(`Extracao de "${project.name}" falhou: ${err.message}`);
      await loadPipelineData();
      throw err;
    } finally {
      setProgress(IDLE);
    }
  }, [loadPipelineData]);

  // Orquestra projeto a projeto: inventario (se em falta) e depois extracao (se em falta).
  // Qualquer erro para a sequencia e fica visivel em pipelineError.
  const runPrepareAll = useCallback(async () => {
    if (!obraId || projects.length === 0) return;
    setPreparing(true);
    setPipelineError(null);
    try {
      const total = projects.length;
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        // Recarrega o estado atual antes de decidir o que falta fazer
        const { data: invNow } = await (supabase as any)
          .from('incompaticheck_doc_inventory').select('*').eq('project_id', p.id).maybeSingle();

        const inv: InventoryRow | null = invNow;
        if (!inv || inv.processing_status !== 'DONE') {
          setProgress({ active: true, projectId: p.id, projectName: p.name, stage: 'INVENTORY', index: i + 1, total });
          await invokeNoisy('incompaticheck-inventory', { project_id: p.id });
        }

        const { count } = await (supabase as any)
          .from('incompaticheck_elements').select('id', { count: 'exact', head: true }).eq('project_id', p.id);
        if (!count || count === 0) {
          setProgress({ active: true, projectId: p.id, projectName: p.name, stage: 'EXTRACTION', index: i + 1, total });
          await invokeNoisy('incompaticheck-extract', { project_id: p.id });
        }
        await loadPipelineData();
      }
    } catch (err: any) {
      setPipelineError(err.message);
      await loadPipelineData();
    } finally {
      setProgress(IDLE);
      setPreparing(false);
    }
  }, [obraId, projects, loadPipelineData]);

  return {
    inventories,
    elementCounts,
    progress,
    preparing,
    pipelineError,
    clearError: () => setPipelineError(null),
    loadPipelineData,
    runInventory,
    runExtraction,
    runPrepareAll,
  };
}
