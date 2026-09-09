import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Layers, Plus, Edit, Archive, ArchiveRestore, Trash2, Loader2, Building2,
} from 'lucide-react';

type Site = { id: string; name: string; incompaticheck_obra_id: string | null };
type Nivel = {
  id: string;
  specialty: string;
  fase: string | null;
  piso: string | null;
  cota: number | null;
  tipo: string | null;
  piso_id: string | null;
};
// Piso da obra: definido uma única vez por obra (eng_silva_pisos), fonte única de
// piso/cota/tipo. As linhas de eng_silva_niveis (especialidade+fase) referenciam-no
// por piso_id; piso/cota/tipo aí ficam denormalizados por trigger na BD.
type Piso = {
  id: string;
  piso: string;
  cota: number | null;
  tipo: string | null;
};

// Especialidades canónicas do sistema (mesmas do Conhecimento do Projecto).
const CATALOGO_ESPECIALIDADES = [
  'Topografia', 'Arquitectura', 'Estrutural', 'Fundações', 'Rede Enterrada',
  'AVAC', 'Águas e Esgotos', 'Electricidade', 'Telecomunicações', 'Gás',
  'Segurança Contra Incêndios', 'Acústica', 'Térmica',
];

type Ctx = {
  id: string;
  site_id: string;
  especialidade: string | null;
  fase: string | null;
  ambiente: string | null;
  atividade: string | null;
  nivel_id: string | null;
  label: string;
  archived_at: string | null;
  last_used_at: string | null;
};

type FormState = {
  especialidade: string;
  fase: string;
  // Piso/cota deixaram de ser texto livre do contexto — o contexto passa a
  // referenciar uma linha do catálogo (eng_silva_niveis), fonte única de piso/cota.
  nivelId: string;
  ambiente: string;
  atividade: string;
  label: string;
  labelEdited: boolean;
};

const EMPTY_FORM: FormState = {
  especialidade: '', fase: '', nivelId: '', ambiente: '', atividade: '', label: '', labelEdited: false,
};

// Chave de célula da matriz especialidade×fase usada para associar um piso a várias
// combinações de uma vez (ver "Pisos da Obra").
const cellKey = (specialty: string, fase: string) => `${specialty}::${fase}`;

// Rótulo legível gerado a partir dos campos preenchidos + do nível resolvido
// (piso/cota vêm sempre do catálogo, nunca de texto digitado no contexto).
function autoLabel(f: FormState, nivel: Nivel | null): string {
  return [
    f.especialidade.trim(),
    f.fase.trim() ? `Fase ${f.fase.trim()}` : '',
    nivel?.piso || '',
    nivel?.cota != null ? `(${String(nivel.cota).replace('.', ',')})` : '',
    f.ambiente.trim(),
    f.atividade.trim(),
  ].filter(Boolean).join(' · ');
}

export default function EstruturaObra() {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string>('');
  const [contexts, setContexts] = useState<Ctx[]>([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Ctx | null>(null);
  const [f, setF] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Catálogo de fases/níveis (eng_silva_niveis)
  const [niveis, setNiveis] = useState<Nivel[]>([]);
  const [loadingNiveis, setLoadingNiveis] = useState(false);
  const [faseOpen, setFaseOpen] = useState(false);
  const [novaFase, setNovaFase] = useState('');
  const [faseEspecialidade, setFaseEspecialidade] = useState('');
  const [faseTodas, setFaseTodas] = useState(true);
  const [savingFase, setSavingFase] = useState(false);
  const [nivelOpen, setNivelOpen] = useState(false);
  const [nivelEditing, setNivelEditing] = useState<Nivel | null>(null);
  const [nivelCtx, setNivelCtx] = useState<{ specialty: string; fase: string } | null>(null);
  const [nivelForm, setNivelForm] = useState<{ pisoId: string }>({ pisoId: '' });
  const [savingNivel, setSavingNivel] = useState(false);

  // Catálogo de pisos da obra (eng_silva_pisos) — definidos uma única vez por obra.
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [loadingPisos, setLoadingPisos] = useState(false);
  const [pisoOpen, setPisoOpen] = useState(false);
  const [pisoEditing, setPisoEditing] = useState<Piso | null>(null);
  const [pisoForm, setPisoForm] = useState<{ piso: string; cota: string; tipo: string }>({ piso: '', cota: '', tipo: '' });
  const [savingPiso, setSavingPiso] = useState(false);
  // Matriz especialidade×fase marcada no diálogo do piso — é isto que substitui a
  // atribuição manual repetida por combinação (chaves via cellKey).
  const [pisoCells, setPisoCells] = useState<Set<string>>(new Set());

  // Carregar obras (mundo captura: sites via memberships)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: mem, error: memErr } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id);
      if (memErr) {
        console.error('Erro ao carregar organizações:', memErr);
        toast.error('Erro ao carregar organizações: ' + memErr.message);
        return;
      }
      const orgIds = (mem || []).map((m) => m.org_id);
      if (!orgIds.length) { setSites([]); return; }
      const { data, error } = await supabase
        .from('sites')
        .select('id, name, incompaticheck_obra_id')
        .in('org_id', orgIds)
        .order('name');
      if (error) {
        console.error('Erro ao carregar obras:', error);
        toast.error('Erro ao carregar obras: ' + error.message);
        return;
      }
      setSites(data || []);
      setSiteId((prev) => prev || data?.[0]?.id || '');
    })();
  }, [user]);

  // Carregar contextos da obra
  const loadContexts = async () => {
    if (!siteId) { setContexts([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('capture_contexts')
      .select('id, site_id, especialidade, fase, ambiente, atividade, nivel_id, label, archived_at, last_used_at')
      .eq('site_id', siteId)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Erro ao carregar contextos:', error);
      toast.error('Erro ao carregar contextos: ' + error.message);
    }
    setContexts((data as Ctx[]) || []);
    setLoading(false);
  };
  useEffect(() => { loadContexts(); /* eslint-disable-next-line */ }, [siteId]);

  const visible = useMemo(
    () => contexts.filter((c) => (showArchived ? true : !c.archived_at)),
    [contexts, showArchived],
  );

  const selectedNivel = niveis.find((n) => n.id === f.nivelId) || null;
  const currentLabel = f.labelEdited && f.label.trim() ? f.label.trim() : autoLabel(f, selectedNivel);

  // Opções do formulário do contexto — sempre a partir do catálogo (eng_silva_niveis),
  // nunca texto livre, para não repetir o desalinhamento "Estrutura" vs "Estrutural".
  const especialidadesCatalogo = useMemo(
    () => [...new Set(niveis.map((n) => n.specialty))].sort(),
    [niveis],
  );
  const fasesCatalogo = useMemo(
    () => [...new Set(
      niveis.filter((n) => !f.especialidade || n.specialty === f.especialidade).map((n) => n.fase).filter(Boolean),
    )] as string[],
    [niveis, f.especialidade],
  );
  const niveisCatalogo = useMemo(
    () => niveis.filter((n) =>
      (!f.especialidade || n.specialty === f.especialidade) &&
      (!f.fase || n.fase === f.fase) &&
      (n.piso || n.cota != null),
    ),
    [niveis, f.especialidade, f.fase],
  );

  // Todas as fases já existentes na obra (não filtradas por especialidade) — usadas
  // como colunas da matriz de associação especialidade×fase no diálogo do piso.
  const todasFasesCatalogo = useMemo(
    () => [...new Set(niveis.map((n) => n.fase).filter(Boolean))].sort() as string[],
    [niveis],
  );

  // Quantas combinações especialidade+fase estão hoje ligadas a cada piso — mostrado
  // na lista de "Pisos da Obra" para o fiscal confirmar a associação sem abrir o editor.
  const pisoUsageCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of niveis) {
      if (n.piso_id) map[n.piso_id] = (map[n.piso_id] || 0) + 1;
    }
    return map;
  }, [niveis]);

  const openNew = () => {
    setEditing(null);
    setF(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (c: Ctx) => {
    setEditing(c);
    setF({
      especialidade: c.especialidade || '',
      fase: c.fase || '',
      nivelId: c.nivel_id || '',
      ambiente: c.ambiente || '',
      atividade: c.atividade || '',
      label: c.label,
      labelEdited: true,
    });
    setFormOpen(true);
  };

  const save = async (continueAfter: boolean) => {
    if (!user || !siteId) return;
    const label = currentLabel;
    if (!label) {
      toast.error('Preencha pelo menos um campo (para gerar o rótulo).');
      return;
    }
    setSaving(true);
    const payload = {
      site_id: siteId,
      especialidade: f.especialidade.trim() || null,
      fase: f.fase.trim() || null,
      nivel_id: f.nivelId || null,
      ambiente: f.ambiente.trim() || null,
      atividade: f.atividade.trim() || null,
      label,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('capture_contexts').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Contexto atualizado.');
        setFormOpen(false);
      } else {
        const { error } = await supabase.from('capture_contexts').insert({ ...payload, created_by: user.id });
        if (error) throw error;
        toast.success('Contexto criado.');
        if (continueAfter) {
          // Guardar e continuar: manter especialidade/fase, limpar o resto
          setF({ ...EMPTY_FORM, especialidade: f.especialidade, fase: f.fase });
        } else {
          setFormOpen(false);
        }
      }
      await loadContexts();
    } catch (err: any) {
      console.error('Guardar contexto:', err);
      toast.error('Erro ao guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (c: Ctx) => {
    const { error } = await supabase
      .from('capture_contexts')
      .update({ archived_at: c.archived_at ? null : new Date().toISOString() })
      .eq('id', c.id);
    if (error) {
      console.error('Arquivar contexto:', error);
      toast.error('Erro: ' + error.message);
      return;
    }
    toast.success(c.archived_at ? 'Contexto reativado.' : 'Contexto arquivado.');
    await loadContexts();
  };

  // Apagar só se NÃO tiver capturas associadas
  const remove = async (c: Ctx) => {
    const { count, error: cErr } = await supabase
      .from('captures')
      .select('id', { count: 'exact', head: true })
      .eq('context_id', c.id);
    if (cErr) {
      console.error('Contar capturas do contexto:', cErr);
      toast.error('Erro: ' + cErr.message);
      return;
    }
    if ((count || 0) > 0) {
      toast.error(`Não é possível apagar: ${count} captura(s) associada(s). Arquive em vez de apagar.`);
      return;
    }
    const { error } = await supabase.from('capture_contexts').delete().eq('id', c.id);
    if (error) {
      console.error('Apagar contexto:', error);
      toast.error('Erro ao apagar: ' + error.message);
      return;
    }
    toast.success('Contexto apagado.');
    await loadContexts();
  };

  // ---- Catálogo de fases/níveis (eng_silva_niveis) ----
  // Ponte site -> obra IncompatiCheck (mesma usada pelas capturas e pela KB).
  const obraId = sites.find((s) => s.id === siteId)?.incompaticheck_obra_id || null;

  const loadNiveis = async () => {
    if (!obraId) { setNiveis([]); return; }
    setLoadingNiveis(true);
    const { data, error } = await supabase
      .from('eng_silva_niveis')
      .select('id, specialty, fase, piso, cota, tipo, piso_id')
      .eq('obra_id', obraId)
      .order('specialty');
    if (error) {
      console.error('Erro ao carregar catálogo:', error);
      toast.error('Erro ao carregar catálogo de níveis: ' + error.message);
    }
    setNiveis((data as Nivel[]) || []);
    setLoadingNiveis(false);
  };
  useEffect(() => { loadNiveis(); /* eslint-disable-next-line */ }, [obraId]);

  // Pisos da obra (eng_silva_pisos) — o fiscal define-os aqui uma única vez; as
  // especialidades/fases abaixo apenas referenciam um destes, nunca reescrevem piso/cota.
  const loadPisos = async () => {
    if (!obraId) { setPisos([]); return; }
    setLoadingPisos(true);
    const { data, error } = await supabase
      .from('eng_silva_pisos')
      .select('id, piso, cota, tipo')
      .eq('obra_id', obraId)
      .order('cota', { ascending: false, nullsFirst: false })
      .order('piso');
    if (error) {
      console.error('Erro ao carregar pisos da obra:', error);
      toast.error('Erro ao carregar pisos da obra: ' + error.message);
    }
    setPisos((data as Piso[]) || []);
    setLoadingPisos(false);
  };
  useEffect(() => { loadPisos(); /* eslint-disable-next-line */ }, [obraId]);

  // Criar fase: uma linha por especialidade escolhida (placeholder cota/piso/tipo a NULL).
  const saveFase = async () => {
    if (!user || !obraId) return;
    // Formato canónico do catálogo é o número puro (ex: "1.1"), sem o prefixo
    // "Fase" — o resto do código (Eng. Silva, carimbo, legenda) já espera este
    // formato e prefixa "Fase" só na apresentação.
    const fase = novaFase.trim().replace(/^fase\s+/i, '');
    if (!fase) { toast.error('Indique a fase (ex: 1.1).'); return; }
    const especialidades = faseTodas
      ? CATALOGO_ESPECIALIDADES
      : (faseEspecialidade ? [faseEspecialidade] : []);
    if (especialidades.length === 0) { toast.error('Escolha uma especialidade ou "todas".'); return; }
    setSavingFase(true);
    // Evita recriar a linha-placeholder (sem piso/cota/tipo) desta fase+especialidade
    // se já existir — era esta falta de verificação que duplicava fases no catálogo.
    const already = new Set(
      niveis.filter((n) => n.fase === fase && !n.piso_id && !n.piso && n.cota == null && !n.tipo).map((n) => n.specialty),
    );
    const toCreate = especialidades.filter((e) => !already.has(e));
    if (toCreate.length === 0) {
      setSavingFase(false);
      toast.info('Esta fase já existe para todas as especialidades escolhidas.');
      setFaseOpen(false);
      return;
    }
    const rows = toCreate.map((specialty) => ({
      obra_id: obraId, user_id: user.id, specialty, fase, cota: null, piso: null, tipo: null,
    }));
    const { error } = await supabase.from('eng_silva_niveis').insert(rows);
    setSavingFase(false);
    if (error) {
      console.error('Criar fase:', error);
      toast.error('Erro ao criar fase: ' + error.message);
      return;
    }
    toast.success(`Fase ${fase} criada para ${toCreate.length} especialidade(s).`);
    setFaseOpen(false);
    setNovaFase('');
    setFaseEspecialidade('');
    setFaseTodas(true);
    await loadNiveis();
  };

  const openNovoNivel = (specialty: string, fase: string) => {
    setNivelEditing(null);
    setNivelCtx({ specialty, fase });
    setNivelForm({ pisoId: '' });
    setNivelOpen(true);
  };

  const openEditNivel = (n: Nivel) => {
    setNivelEditing(n);
    setNivelCtx({ specialty: n.specialty, fase: n.fase || '' });
    setNivelForm({ pisoId: n.piso_id || '__none__' });
    setNivelOpen(true);
  };

  // O nível (especialidade+fase) já não guarda piso/cota/tipo em texto livre —
  // referencia um piso do catálogo da obra (piso_id). O valor denormalizado em
  // eng_silva_niveis.piso/cota/tipo é escrito pela BD (trigger), nunca por aqui.
  const saveNivel = async () => {
    if (!user || !obraId || !nivelCtx) return;
    if (!nivelForm.pisoId) {
      toast.error('Escolha um piso do catálogo da obra (ou "Sem piso" para deixar por atribuir).');
      return;
    }
    setSavingNivel(true);
    const payload = { piso_id: nivelForm.pisoId === '__none__' ? null : nivelForm.pisoId };
    let error;
    if (nivelEditing) {
      ({ error } = await supabase.from('eng_silva_niveis').update(payload).eq('id', nivelEditing.id));
    } else {
      ({ error } = await supabase.from('eng_silva_niveis').insert({
        obra_id: obraId, user_id: user.id, specialty: nivelCtx.specialty, fase: nivelCtx.fase || null, ...payload,
      }));
    }
    setSavingNivel(false);
    if (error) {
      console.error('Guardar nível:', error);
      toast.error('Erro ao guardar nível: ' + error.message);
      return;
    }
    toast.success(nivelEditing ? 'Nível atualizado.' : 'Nível adicionado.');
    setNivelOpen(false);
    await loadNiveis();
  };

  const removeNivel = async (n: Nivel) => {
    if (!window.confirm('Apagar este nível?')) return;
    const { error } = await supabase.from('eng_silva_niveis').delete().eq('id', n.id);
    if (error) { console.error('Apagar nível:', error); toast.error('Erro ao apagar: ' + error.message); return; }
    toast.success('Nível apagado.');
    await loadNiveis();
  };

  // ---- Pisos da obra (eng_silva_pisos) ----
  const openNovoPiso = () => {
    setPisoEditing(null);
    setPisoForm({ piso: '', cota: '', tipo: '' });
    setPisoCells(new Set());
    setPisoOpen(true);
  };

  const openEditPiso = (p: Piso) => {
    setPisoEditing(p);
    setPisoForm({ piso: p.piso, cota: p.cota != null ? String(p.cota) : '', tipo: p.tipo || '' });
    // Pré-selecção exacta (não um rectângulo aproximado): só as combinações que
    // hoje apontam mesmo para este piso ficam marcadas.
    setPisoCells(new Set(
      niveis.filter((n) => n.piso_id === p.id && n.fase).map((n) => cellKey(n.specialty, n.fase as string)),
    ));
    setPisoOpen(true);
  };

  const togglePisoCell = (specialty: string, fase: string) => {
    const key = cellKey(specialty, fase);
    setPisoCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleFaseColuna = (fase: string) => {
    setPisoCells((prev) => {
      const allChecked = especialidadesCatalogo.every((esp) => prev.has(cellKey(esp, fase)));
      const next = new Set(prev);
      for (const esp of especialidadesCatalogo) {
        const key = cellKey(esp, fase);
        if (allChecked) next.delete(key); else next.add(key);
      }
      return next;
    });
  };

  const toggleEspecialidadeLinha = (specialty: string) => {
    setPisoCells((prev) => {
      const allChecked = todasFasesCatalogo.every((fase) => prev.has(cellKey(specialty, fase)));
      const next = new Set(prev);
      for (const fase of todasFasesCatalogo) {
        const key = cellKey(specialty, fase);
        if (allChecked) next.delete(key); else next.add(key);
      }
      return next;
    });
  };

  // Guarda o piso (dados próprios) e reconcilia a matriz especialidade×fase marcada
  // com eng_silva_niveis: é isto que substitui a atribuição manual repetida por
  // combinação — o fiscal marca aqui, de uma vez, todas as combinações deste piso.
  const savePiso = async () => {
    if (!user || !obraId) return;
    const piso = pisoForm.piso.trim();
    if (!piso) { toast.error('Indique o piso (ex: Piso -6).'); return; }
    let cotaNum: number | null = null;
    if (pisoForm.cota.trim()) {
      cotaNum = Number(pisoForm.cota.trim().replace(',', '.'));
      if (Number.isNaN(cotaNum)) { toast.error('Cota inválida.'); return; }
    }
    setSavingPiso(true);
    const payload = { piso, cota: cotaNum, tipo: pisoForm.tipo.trim() || null };

    let pisoId: string;
    if (pisoEditing) {
      const { error } = await supabase.from('eng_silva_pisos').update(payload).eq('id', pisoEditing.id);
      if (error) {
        setSavingPiso(false);
        console.error('Guardar piso:', error);
        toast.error('Erro ao guardar piso: ' + error.message);
        return;
      }
      pisoId = pisoEditing.id;
    } else {
      const { data, error } = await supabase
        .from('eng_silva_pisos')
        .insert({ obra_id: obraId, user_id: user.id, ...payload })
        .select('id')
        .single();
      if (error || !data) {
        setSavingPiso(false);
        console.error('Guardar piso:', error);
        toast.error('Erro ao guardar piso: ' + (error?.message || 'sem resposta da BD'));
        return;
      }
      pisoId = data.id;
    }

    const currentRows = niveis.filter((n) => n.piso_id === pisoId);
    const current = new Set(currentRows.map((n) => cellKey(n.specialty, n.fase || '')));
    const toAddKeys = [...pisoCells].filter((k) => !current.has(k));
    const toRemoveRows = currentRows.filter((n) => !pisoCells.has(cellKey(n.specialty, n.fase || '')));

    // Reutiliza o placeholder (sem piso) já existente para a combinação sempre que
    // possível, em vez de duplicar linhas — só cria linha nova quando a combinação
    // já está ocupada por outro piso (uma fase pode existir em vários pisos físicos).
    const idsToReuse: string[] = [];
    const toInsert: { obra_id: string; user_id: string; specialty: string; fase: string; piso_id: string }[] = [];
    for (const key of toAddKeys) {
      const [specialty, fase] = key.split('::');
      const placeholder = niveis.find((n) => n.specialty === specialty && n.fase === fase && !n.piso_id);
      if (placeholder) idsToReuse.push(placeholder.id);
      else toInsert.push({ obra_id: obraId, user_id: user.id, specialty, fase, piso_id: pisoId });
    }
    // Ao desmarcar: se já existir outro placeholder para a mesma combinação, apaga a
    // linha redundante em vez de criar dois placeholders para a mesma combinação
    // (violaria idx_niveis_unique_placeholder); senão, a própria linha vira placeholder.
    const idsToUnlink: string[] = [];
    const idsToDelete: string[] = [];
    for (const n of toRemoveRows) {
      const hasOtherPlaceholder = niveis.some(
        (o) => o.id !== n.id && o.specialty === n.specialty && o.fase === n.fase && !o.piso_id,
      );
      if (hasOtherPlaceholder) idsToDelete.push(n.id); else idsToUnlink.push(n.id);
    }

    const ops: Promise<{ error: { message: string } | null }>[] = [];
    if (idsToReuse.length > 0) ops.push(supabase.from('eng_silva_niveis').update({ piso_id: pisoId }).in('id', idsToReuse));
    if (toInsert.length > 0) ops.push(supabase.from('eng_silva_niveis').insert(toInsert));
    if (idsToUnlink.length > 0) ops.push(supabase.from('eng_silva_niveis').update({ piso_id: null }).in('id', idsToUnlink));
    if (idsToDelete.length > 0) ops.push(supabase.from('eng_silva_niveis').delete().in('id', idsToDelete));

    const results = await Promise.all(ops);
    setSavingPiso(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('Associar especialidades/fases ao piso:', failed.error);
      toast.error('Piso guardado, mas falhou a associação de especialidades/fases: ' + failed.error.message);
      await loadPisos();
      await loadNiveis();
      return;
    }

    toast.success(pisoEditing ? 'Piso e associações atualizados.' : 'Piso criado e associado.');
    setPisoOpen(false);
    await loadPisos();
    // Editar um piso já usado propaga piso/cota/tipo para os níveis ligados (trigger na BD).
    await loadNiveis();
  };

  const removePiso = async (p: Piso) => {
    const emUso = niveis.filter((n) => n.piso_id === p.id).length;
    const aviso = emUso > 0
      ? `Este piso está associado a ${emUso} nível(is). Ao apagar, esses níveis ficam sem piso atribuído. Continuar?`
      : 'Apagar este piso?';
    if (!window.confirm(aviso)) return;
    const { error } = await supabase.from('eng_silva_pisos').delete().eq('id', p.id);
    if (error) { console.error('Apagar piso:', error); toast.error('Erro ao apagar: ' + error.message); return; }
    toast.success('Piso apagado.');
    await loadPisos();
    await loadNiveis();
  };

  const removeFase = async (specialty: string, fase: string) => {
    if (!obraId) return;
    if (!window.confirm(`Apagar a fase ${fase} de ${specialty} e todos os seus níveis?`)) return;
    const { error } = await supabase
      .from('eng_silva_niveis')
      .delete()
      .eq('obra_id', obraId)
      .eq('specialty', specialty)
      .eq('fase', fase);
    if (error) { console.error('Apagar fase:', error); toast.error('Erro ao apagar fase: ' + error.message); return; }
    toast.success(`Fase ${fase} apagada.`);
    await loadNiveis();
  };

  // Agrupar catálogo: especialidade -> fase -> níveis
  const catalogoPorEspecialidade = useMemo(() => {
    const bySpec: Record<string, Record<string, Nivel[]>> = {};
    for (const n of niveis) {
      const fase = n.fase || '(sem fase)';
      if (!bySpec[n.specialty]) bySpec[n.specialty] = {};
      if (!bySpec[n.specialty][fase]) bySpec[n.specialty][fase] = [];
      bySpec[n.specialty][fase].push(n);
    }
    return bySpec;
  }, [niveis]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Layers className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Estrutura da Obra</h1>
            <p className="text-muted-foreground">Contextos de captura (Especialidade · Fase · Piso · Cota · Ambiente · Atividade)</p>
          </div>
        </div>
        <Button onClick={openNew} disabled={!siteId}>
          <Plus className="w-4 h-4 mr-2" /> Novo Contexto
        </Button>
      </div>

      {/* Obra + filtro arquivados */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Seleccionar obra" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant={showArchived ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'A mostrar arquivados' : 'Mostrar arquivados'}
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : sites.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma obra disponível.</CardContent></Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Layers className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground">Ainda não há contextos para esta obra.</p>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Criar Primeiro Contexto</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <Card key={c.id} className={c.archived_at ? 'opacity-60' : 'hover:border-primary/30 transition'}>
              <CardContent className="flex items-center justify-between p-4 gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{c.label}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {c.archived_at && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Arquivado</Badge>}
                    {c.especialidade && <span className="text-xs text-muted-foreground">{c.especialidade}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Editar">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleArchive(c)} title={c.archived_at ? 'Reativar' : 'Arquivar'}>
                    {c.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c)} title="Apagar (só sem capturas)" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pisos da Obra — definidos uma única vez, reutilizados por todas as especialidades/fases */}
      {sites.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Pisos da Obra</h2>
                  <p className="text-xs text-muted-foreground">
                    O piso pertence à obra, não à especialidade — defina-o aqui uma única vez,
                    com a sua cota, e associe-lhe de uma vez todas as especialidades e fases que
                    ali se trabalham (sem repetir a introdução por combinação).
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={openNovoPiso} disabled={!obraId}>
                <Plus className="w-4 h-4 mr-2" /> Novo Piso
              </Button>
            </div>

            {!obraId ? (
              <p className="text-sm text-muted-foreground">
                Esta obra não está ligada a uma obra do IncompatiCheck — os pisos usam essa ligação.
              </p>
            ) : loadingPisos ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : pisos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há pisos definidos nesta obra. Comece por criar um piso.</p>
            ) : (
              <div className="space-y-1">
                {pisos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border p-2">
                    <div className="min-w-0">
                      <span className="text-foreground truncate block">
                        {[p.piso, p.cota != null ? `(${String(p.cota).replace('.', ',')})` : '', p.tipo].filter(Boolean).join(' · ')}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {pisoUsageCount[p.id] || 0} combinação(ões) especialidade·fase associada(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPiso(p)} title="Editar piso">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removePiso(p)} title="Apagar piso">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Catálogo de Fases e Níveis */}
      {sites.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Fases e Níveis (Catálogo da Obra)</h2>
                  <p className="text-xs text-muted-foreground">Alimenta o Eng. Silva e o upload da Base de Conhecimento</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setFaseOpen(true)} disabled={!obraId}>
                <Plus className="w-4 h-4 mr-2" /> Nova Fase
              </Button>
            </div>

            {!obraId ? (
              <p className="text-sm text-muted-foreground">
                Esta obra não está ligada a uma obra do IncompatiCheck — o catálogo de níveis usa essa ligação.
              </p>
            ) : loadingNiveis ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : Object.keys(catalogoPorEspecialidade).length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há fases neste catálogo. Comece por criar uma fase.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(catalogoPorEspecialidade).map(([specialty, fases]) => (
                  <div key={specialty} className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{specialty}</p>
                    {Object.entries(fases).map(([fase, rows]) => {
                      const nivelRows = rows.filter((r) => r.piso || r.cota != null || r.tipo);
                      return (
                        <div key={fase} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="secondary">{fase === '(sem fase)' ? 'Sem fase' : `Fase ${fase}`}</Badge>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openNovoNivel(specialty, fase === '(sem fase)' ? '' : fase)}>
                                <Plus className="w-3.5 h-3.5 mr-1" /> Nível
                              </Button>
                              {fase !== '(sem fase)' && (
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => removeFase(specialty, fase)} title="Apagar fase"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {nivelRows.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sem níveis. Adicione cota/piso/tipo.</p>
                          ) : (
                            <div className="space-y-1">
                              {nivelRows.map((n) => (
                                <div key={n.id} className="flex items-center justify-between gap-2 text-sm">
                                  <span className="text-foreground truncate">
                                    {[n.piso, n.cota != null ? `(${n.cota})` : '', n.tipo].filter(Boolean).join(' · ')}
                                  </span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditNivel(n)} title="Editar nível">
                                      <Edit className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeNivel(n)} title="Apagar nível">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog: Nova Fase */}
      <Dialog open={faseOpen} onOpenChange={setFaseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Fase</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Fase</Label>
              <Input value={novaFase} onChange={(e) => setNovaFase(e.target.value)} placeholder="ex: 1.1" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={faseTodas} onChange={(e) => setFaseTodas(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Criar para todas as especialidades
            </label>
            {!faseTodas && (
              <div className="space-y-1">
                <Label>Especialidade</Label>
                <Select value={faseEspecialidade} onValueChange={setFaseEspecialidade}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar especialidade" /></SelectTrigger>
                  <SelectContent>
                    {CATALOGO_ESPECIALIDADES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaseOpen(false)} disabled={savingFase}>Cancelar</Button>
            <Button onClick={saveFase} disabled={savingFase}>
              {savingFase && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nível */}
      <Dialog open={nivelOpen} onOpenChange={setNivelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {nivelEditing ? 'Editar Nível' : 'Novo Nível'}
              {nivelCtx ? ` — ${nivelCtx.specialty}${nivelCtx.fase ? ` · Fase ${nivelCtx.fase}` : ''}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pisos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há pisos definidos nesta obra. Feche este diálogo e crie os pisos em
                "Pisos da Obra" acima — definem-se uma única vez e ficam disponíveis para todas
                as especialidades e fases.
              </p>
            ) : (
              <div className="space-y-1">
                <Label>Piso</Label>
                <Select value={nivelForm.pisoId} onValueChange={(v) => setNivelForm({ pisoId: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar piso" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem piso (placeholder)</SelectItem>
                    {pisos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {[p.piso, p.cota != null ? `(${String(p.cota).replace('.', ',')})` : '', p.tipo].filter(Boolean).join(' · ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNivelOpen(false)} disabled={savingNivel}>Cancelar</Button>
            <Button onClick={saveNivel} disabled={savingNivel}>
              {savingNivel && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Piso da Obra */}
      <Dialog open={pisoOpen} onOpenChange={setPisoOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{pisoEditing ? 'Editar Piso' : 'Novo Piso'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Piso</Label>
                <Input value={pisoForm.piso} onChange={(e) => setPisoForm((s) => ({ ...s, piso: e.target.value }))} placeholder="ex: Piso -6" />
              </div>
              <div className="space-y-1">
                <Label>Cota</Label>
                <Input value={pisoForm.cota} onChange={(e) => setPisoForm((s) => ({ ...s, cota: e.target.value }))} placeholder="ex: -21.45" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Input value={pisoForm.tipo} onChange={(e) => setPisoForm((s) => ({ ...s, tipo: e.target.value }))} placeholder="ex: laje de fundação" />
            </div>

            <div className="space-y-1">
              <Label>Especialidades e fases que se trabalham neste piso</Label>
              {especialidadesCatalogo.length === 0 || todasFasesCatalogo.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ainda não há especialidades/fases nesta obra. Crie pelo menos uma fase em
                  "Fases e Níveis" abaixo antes de associar especialidades a este piso.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto border rounded-lg max-h-[360px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background">
                        <tr>
                          <th className="text-left p-1.5 font-medium">Especialidade</th>
                          {todasFasesCatalogo.map((fase) => (
                            <th key={fase} className="p-1.5 font-medium">
                              <button
                                type="button"
                                className="flex flex-col items-center gap-0.5 mx-auto hover:text-primary"
                                onClick={() => toggleFaseColuna(fase)}
                                title={`Marcar/desmarcar Fase ${fase} para todas as especialidades`}
                              >
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={especialidadesCatalogo.every((esp) => pisoCells.has(cellKey(esp, fase)))}
                                  className="h-3.5 w-3.5 rounded border-input pointer-events-none"
                                />
                                <span>Fase {fase}</span>
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {especialidadesCatalogo.map((esp) => (
                          <tr key={esp} className="border-t">
                            <td className="p-1.5">
                              <button
                                type="button"
                                className="flex items-center gap-1.5 hover:text-primary"
                                onClick={() => toggleEspecialidadeLinha(esp)}
                                title={`Marcar/desmarcar ${esp} em todas as fases`}
                              >
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={todasFasesCatalogo.every((fase) => pisoCells.has(cellKey(esp, fase)))}
                                  className="h-3.5 w-3.5 rounded border-input pointer-events-none"
                                />
                                <span className="truncate">{esp}</span>
                              </button>
                            </td>
                            {todasFasesCatalogo.map((fase) => (
                              <td key={fase} className="text-center p-1.5">
                                <input
                                  type="checkbox"
                                  checked={pisoCells.has(cellKey(esp, fase))}
                                  onChange={() => togglePisoCell(esp, fase)}
                                  className="h-3.5 w-3.5 rounded border-input"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Marque as combinações que se trabalham neste piso. Clique no nome de uma
                    especialidade ou de uma fase para marcar/desmarcar a linha/coluna inteira.
                  </p>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPisoOpen(false)} disabled={savingPiso}>Cancelar</Button>
            <Button onClick={savePiso} disabled={savingPiso}>
              {savingPiso && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Contexto' : 'Novo Contexto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Especialidade</Label>
                <Select
                  value={f.especialidade}
                  onValueChange={(v) => setF((s) => ({ ...s, especialidade: v, fase: '', nivelId: '' }))}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar especialidade" /></SelectTrigger>
                  <SelectContent>
                    {especialidadesCatalogo.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fase</Label>
                <Select
                  value={f.fase}
                  onValueChange={(v) => setF((s) => ({ ...s, fase: v, nivelId: '' }))}
                  disabled={!f.especialidade}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={f.especialidade ? 'Seleccionar fase' : 'Escolha a especialidade primeiro'} />
                  </SelectTrigger>
                  <SelectContent>
                    {fasesCatalogo.map((fs) => <SelectItem key={fs} value={fs}>Fase {fs}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Nível (piso / cota) — vem do catálogo da obra, fonte única</Label>
                <Select
                  value={f.nivelId}
                  onValueChange={(v) => setF((s) => ({ ...s, nivelId: v }))}
                  disabled={!f.especialidade || !f.fase}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      !f.especialidade || !f.fase
                        ? 'Escolha especialidade e fase primeiro'
                        : niveisCatalogo.length === 0
                          ? 'Sem níveis com piso/cota nesta fase — adicione no catálogo abaixo'
                          : 'Seleccionar nível'
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {niveisCatalogo.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {[n.piso, n.cota != null ? `(${String(n.cota).replace('.', ',')})` : '', n.tipo].filter(Boolean).join(' · ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ambiente</Label>
                <Input value={f.ambiente} onChange={(e) => setF((s) => ({ ...s, ambiente: e.target.value }))} placeholder="ex: Núcleo de escadas" />
              </div>
              <div className="space-y-1">
                <Label>Atividade</Label>
                <Input value={f.atividade} onChange={(e) => setF((s) => ({ ...s, atividade: e.target.value }))} placeholder="ex: Armação de laje" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Rótulo (gerado automaticamente, editável)</Label>
              <Input
                value={currentLabel}
                onChange={(e) => setF((s) => ({ ...s, label: e.target.value, labelEdited: true }))}
                placeholder="Rótulo do contexto"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            {!editing && (
              <Button variant="secondary" onClick={() => save(true)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar e continuar
              </Button>
            )}
            <Button onClick={() => save(false)} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
