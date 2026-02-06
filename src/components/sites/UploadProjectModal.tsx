import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropZone } from '@/components/captures/DropZone';
import { toast } from 'sonner';
import { Upload, Loader2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type ProjectSpecialty = Database['public']['Enums']['project_specialty'];

interface UploadProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  orgId: string;
  preSelectedSpecialty?: ProjectSpecialty;
}

const SPECIALTY_OPTIONS: { value: ProjectSpecialty; label: string }[] = [
  { value: 'topography', label: 'Topografia' },
  { value: 'architecture', label: 'Arquitectura' },
  { value: 'structure', label: 'Estruturas' },
  { value: 'plumbing', label: 'Águas e Esgotos' },
  { value: 'electrical', label: 'Electricidade' },
  { value: 'hvac', label: 'AVAC' },
  { value: 'gas', label: 'Gás' },
  { value: 'telecom', label: 'Telecomunicações' },
  { value: 'other', label: 'Outros' },
];

const FLOOR_OPTIONS = [
  'Geral', 'Cave', 'Piso 0', 'Piso 1', 'Piso 2', 'Piso 3', 'Piso 4',
  'Piso 5', 'Piso 6', 'Piso 7', 'Piso 8', 'Piso 9', 'Piso 10', 'Cobertura',
];

export function UploadProjectModal({
  open, onOpenChange, siteId, orgId, preSelectedSpecialty,
}: UploadProjectModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [specialty, setSpecialty] = useState<ProjectSpecialty | ''>(preSelectedSpecialty || '');
  const [floorOrZone, setFloorOrZone] = useState('');
  const [customFloor, setCustomFloor] = useState('');
  const [version, setVersion] = useState('');
  const [isCurrent, setIsCurrent] = useState(true);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const resetForm = () => {
    setSpecialty(preSelectedSpecialty || '');
    setFloorOrZone('');
    setCustomFloor('');
    setVersion('');
    setIsCurrent(true);
    setDescription('');
    setFiles([]);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!specialty || files.length === 0 || !user) throw new Error('Campos obrigatórios em falta');

      const file = files[0];
      const ext = file.name.split('.').pop();
      const path = `organizations/${orgId}/sites/${siteId}/projects/${specialty}/${Date.now()}.${ext}`;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);

      // If marking as current, unmark others
      if (isCurrent) {
        await supabase
          .from('projects')
          .update({ is_current_version: false })
          .eq('site_id', siteId)
          .eq('specialty', specialty)
          .eq('is_current_version', true);
      }

      const zone = floorOrZone === '__custom' ? customFloor : floorOrZone;

      const { error } = await supabase.from('projects').insert({
        organization_id: orgId,
        site_id: siteId,
        specialty,
        name: file.name.replace(/\.[^/.]+$/, ''),
        description: description || null,
        floor_or_zone: zone || null,
        version: version || '1',
        is_current_version: isCurrent,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', siteId] });
      toast.success('Projecto carregado com sucesso');
      resetForm();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error('Erro ao carregar projecto', { description: err.message });
    },
  });

  const canSubmit = !!specialty && files.length > 0 && !uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Carregar Projecto
          </DialogTitle>
          <DialogDescription>
            Faça upload de ficheiros de projecto (PDF, PNG, JPG — máx. 50MB)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Specialty */}
          <div className="space-y-2">
            <Label>Especialidade *</Label>
            <Select value={specialty} onValueChange={(v) => setSpecialty(v as ProjectSpecialty)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar especialidade" />
              </SelectTrigger>
              <SelectContent>
                {SPECIALTY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Floor / Zone */}
          <div className="space-y-2">
            <Label>Piso / Zona</Label>
            <Select value={floorOrZone} onValueChange={setFloorOrZone}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar piso ou zona" />
              </SelectTrigger>
              <SelectContent>
                {FLOOR_OPTIONS.map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
                <SelectItem value="__custom">Outro...</SelectItem>
              </SelectContent>
            </Select>
            {floorOrZone === '__custom' && (
              <Input
                placeholder="Especifique o piso ou zona"
                value={customFloor}
                onChange={e => setCustomFloor(e.target.value)}
              />
            )}
          </div>

          {/* Version */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Versão</Label>
              <Input placeholder="Ex: 1.0, Rev.A" value={version} onChange={e => setVersion(e.target.value)} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={isCurrent} onCheckedChange={v => setIsCurrent(!!v)} />
                Versão actual
              </label>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              placeholder="Descrição do projecto..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Dropzone */}
          <div className="space-y-2">
            <Label>Ficheiro *</Label>
            <DropZone
              onFilesSelected={(f) => setFiles(f.slice(0, 1))}
              maxFiles={1}
              currentFileCount={files.length}
              accept=".pdf,.png,.jpg,.jpeg"
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {files[0].name} ({(files[0].size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => uploadMutation.mutate()} disabled={!canSubmit}>
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                A carregar...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Carregar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
