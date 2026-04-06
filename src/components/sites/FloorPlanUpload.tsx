import { useState, useRef } from 'react';
import { Upload, Loader2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface FloorPlanUploadProps {
  siteId: string;
  floorId: string;
  floorName: string;
  onUploadComplete: () => void;
}

export function FloorPlanUpload({ siteId, floorId, floorName, onUploadComplete }: FloorPlanUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${siteId}/${floorId}/planta_${timestamp}_${safeName}`;

      // Upload para o bucket project-files
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      // Criar registo na tabela project_files
      const { error: insertError } = await supabase
        .from('project_files')
        .insert({
          name: file.name,
          file_path: filePath,
          site_id: siteId,
          floor_id: floorId,
          type: 'planta_piso',
          mime_type: file.type || 'application/pdf',
        });

      if (insertError) throw insertError;

      toast.success(`Planta carregada para ${floorName}`);
      onUploadComplete();
    } catch (err: any) {
      console.error('Floor plan upload error:', err);
      toast.error('Erro ao carregar planta: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <ImageIcon className="mr-1 h-3 w-3" />
        )}
        Planta
      </Button>
    </>
  );
}
