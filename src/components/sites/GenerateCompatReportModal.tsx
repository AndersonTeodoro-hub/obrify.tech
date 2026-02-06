import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FileText, Loader2 } from 'lucide-react';
import { generateCompatibilizationReport } from '@/services/pdfGenerator';
import { toast } from 'sonner';

interface GenerateCompatReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  orgId: string;
}

export function GenerateCompatReportModal({
  open,
  onOpenChange,
  siteId,
  orgId,
}: GenerateCompatReportModalProps) {
  const { t } = useTranslation();
  const [includeResolved, setIncludeResolved] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const blob = await generateCompatibilizationReport({
        siteId,
        orgId,
        includeResolved,
        includeImages,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Relatorio_Compatibilizacao_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Relatório gerado com sucesso');
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error generating report:', err);
      toast.error('Erro ao gerar relatório', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Gerar Relatório de Compatibilização
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Configure as opções do relatório de compatibilização de projectos.
          </p>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeResolved"
              checked={includeResolved}
              onCheckedChange={(v) => setIncludeResolved(!!v)}
            />
            <Label htmlFor="includeResolved" className="text-sm cursor-pointer">
              Incluir conflitos resolvidos
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeImages"
              checked={includeImages}
              onCheckedChange={(v) => setIncludeImages(!!v)}
            />
            <Label htmlFor="includeImages" className="text-sm cursor-pointer">
              Incluir imagens das plantas
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                A gerar...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Gerar Relatório
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
