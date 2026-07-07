import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ContextObraModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentContext: string | null;
  onSave: (context: string) => Promise<void>;
}

export default function ContextObraModal({ isOpen, onClose, currentContext, onSave }: ContextObraModalProps) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) { setValue(currentContext || ''); setError(null); }
  }, [isOpen, currentContext]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar o contexto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contexto da Obra para Análise</DialogTitle>
          <DialogDescription>
            Convenções de pisos, cotas e nomenclatura desta obra. O motor de análise aplica-as em todos os documentos.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
          placeholder={'Ex: Níveis: N-06 no nome do ficheiro = nível/piso -6. Piso -6: cota estrutural 21.45, cota arquitetura (acabado) 21.70. Piso -5: ... Eixos: letras A-K, números 1-15.'}
          className="font-mono text-sm min-h-[200px]"
        />
        {error && (
          <p className="text-xs text-destructive whitespace-pre-wrap break-words">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
