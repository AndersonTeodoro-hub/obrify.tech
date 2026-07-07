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

type Site = { id: string; name: string };
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
        .select('id, name')
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
