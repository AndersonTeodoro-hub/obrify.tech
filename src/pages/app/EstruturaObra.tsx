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
  piso: string | null;
  cota: number | null;
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
  piso: string;
  cota: string;
  ambiente: string;
  atividade: string;
  label: string;
  labelEdited: boolean;
};

const EMPTY_FORM: FormState = {
  especialidade: '', fase: '', piso: '', cota: '', ambiente: '', atividade: '', label: '', labelEdited: false,
};

// Rótulo legível gerado a partir dos campos preenchidos.
function autoLabel(f: FormState): string {
  const cotaFmt = f.cota.trim() ? `(${f.cota.trim().replace('.', ',')})` : '';
  return [
    f.especialidade.trim(),
    f.fase.trim() ? `Fase ${f.fase.trim()}` : '',
    f.piso.trim(),
    cotaFmt,
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
  const [nivelForm, setNivelForm] = useState<{ cota: string; piso: string; tipo: string }>({ cota: '', piso: '', tipo: '' });
  const [savingNivel, setSavingNivel] = useState(false);

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
      .select('id, site_id, especialidade, fase, piso, cota, ambiente, atividade, nivel_id, label, archived_at, last_used_at')
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

  const currentLabel = f.labelEdited && f.label.trim() ? f.label.trim() : autoLabel(f);

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
      piso: c.piso || '',
      cota: c.cota != null ? String(c.cota) : '',
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
    let cotaNum: number | null = null;
    if (f.cota.trim()) {
      cotaNum = Number(f.cota.trim().replace(',', '.'));
      if (Number.isNaN(cotaNum)) { toast.error('Cota inválida.'); return; }
    }
    setSaving(true);
    const payload = {
      site_id: siteId,
      especialidade: f.especialidade.trim() || null,
      fase: f.fase.trim() || null,
      piso: f.piso.trim() || null,
      cota: cotaNum,
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
      .select('id, specialty, fase, piso, cota, tipo')
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

  // Criar fase: uma linha por especialidade escolhida (placeholder cota/piso/tipo a NULL).
  const saveFase = async () => {
    if (!user || !obraId) return;
    const fase = novaFase.trim();
    if (!fase) { toast.error('Indique a fase (ex: 1.1).'); return; }
    const especialidades = faseTodas
      ? CATALOGO_ESPECIALIDADES
      : (faseEspecialidade ? [faseEspecialidade] : []);
    if (especialidades.length === 0) { toast.error('Escolha uma especialidade ou "todas".'); return; }
    setSavingFase(true);
    const rows = especialidades.map((specialty) => ({
      obra_id: obraId, user_id: user.id, specialty, fase, cota: null, piso: null, tipo: null,
    }));
    const { error } = await supabase.from('eng_silva_niveis').insert(rows);
    setSavingFase(false);
    if (error) {
      console.error('Criar fase:', error);
      toast.error('Erro ao criar fase: ' + error.message);
      return;
    }
    toast.success(`Fase ${fase} criada para ${especialidades.length} especialidade(s).`);
    setFaseOpen(false);
    setNovaFase('');
    setFaseEspecialidade('');
    setFaseTodas(true);
    await loadNiveis();
  };

  const openNovoNivel = (specialty: string, fase: string) => {
    setNivelEditing(null);
    setNivelCtx({ specialty, fase });
    setNivelForm({ cota: '', piso: '', tipo: '' });
    setNivelOpen(true);
  };

  const openEditNivel = (n: Nivel) => {
    setNivelEditing(n);
    setNivelCtx({ specialty: n.specialty, fase: n.fase || '' });
    setNivelForm({ cota: n.cota != null ? String(n.cota) : '', piso: n.piso || '', tipo: n.tipo || '' });
    setNivelOpen(true);
  };

  const saveNivel = async () => {
    if (!user || !obraId || !nivelCtx) return;
    let cotaNum: number | null = null;
    if (nivelForm.cota.trim()) {
      cotaNum = Number(nivelForm.cota.trim().replace(',', '.'));
      if (Number.isNaN(cotaNum)) { toast.error('Cota inválida.'); return; }
    }
    if (!nivelForm.piso.trim() && cotaNum == null && !nivelForm.tipo.trim()) {
      toast.error('Preencha pelo menos cota, piso ou tipo.');
      return;
    }
    setSavingNivel(true);
    const payload = {
      piso: nivelForm.piso.trim() || null,
      cota: cotaNum,
      tipo: nivelForm.tipo.trim() || null,
    };
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cota</Label>
                <Input value={nivelForm.cota} onChange={(e) => setNivelForm((s) => ({ ...s, cota: e.target.value }))} placeholder="ex: -21.45" />
              </div>
              <div className="space-y-1">
                <Label>Piso</Label>
                <Input value={nivelForm.piso} onChange={(e) => setNivelForm((s) => ({ ...s, piso: e.target.value }))} placeholder="ex: Piso -6" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Input value={nivelForm.tipo} onChange={(e) => setNivelForm((s) => ({ ...s, tipo: e.target.value }))} placeholder="ex: laje de fundação" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNivelOpen(false)} disabled={savingNivel}>Cancelar</Button>
            <Button onClick={saveNivel} disabled={savingNivel}>
              {savingNivel && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
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
                <Input value={f.especialidade} onChange={(e) => setF((s) => ({ ...s, especialidade: e.target.value }))} placeholder="ex: Estrutural" />
              </div>
              <div className="space-y-1">
                <Label>Fase</Label>
                <Input value={f.fase} onChange={(e) => setF((s) => ({ ...s, fase: e.target.value }))} placeholder="ex: 1.1" />
              </div>
              <div className="space-y-1">
                <Label>Piso</Label>
                <Input value={f.piso} onChange={(e) => setF((s) => ({ ...s, piso: e.target.value }))} placeholder="ex: Piso -6" />
              </div>
              <div className="space-y-1">
                <Label>Cota</Label>
                <Input value={f.cota} onChange={(e) => setF((s) => ({ ...s, cota: e.target.value }))} placeholder="ex: -21.45" />
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
