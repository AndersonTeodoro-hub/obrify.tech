import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, FileText, Download, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface SiteDocumentsTabProps {
  siteId: string;
  orgId: string;
}

const DOC_TYPES = ['contract', 'license', 'permit', 'insurance', 'minutes', 'safetyPlan', 'other'] as const;

const docTypeBadgeColors: Record<string, string> = {
  contract: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  license: 'bg-green-500/10 text-green-600 border-green-500/20',
  permit: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  insurance: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  minutes: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  safetyPlan: 'bg-red-500/10 text-red-600 border-red-500/20',
  other: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SiteDocumentsTab({ siteId, orgId }: SiteDocumentsTabProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<{ id: string; name: string; file_path: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['site-documents', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setDocName('');
    setDocType('');
    setDocNotes('');
    setDocFile(null);
  };

  const handleUpload = async () => {
    if (!docName.trim() || !docFile || !user) return;
    if (docFile.size > 20 * 1024 * 1024) {
      toast({ title: t('common.error'), description: 'Max 20MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const filePath = `organizations/${orgId}/sites/${siteId}/docs/${Date.now()}_${docFile.name}`;
      const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, docFile);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('documents').insert({
        name: docName.trim(),
        doc_type: docType || null,
        file_path: filePath,
        file_size: docFile.size,
        org_id: orgId,
        site_id: siteId,
        uploaded_by: user.id,
        notes: docNotes.trim() || null,
      } as any);
      if (insertError) throw insertError;

      toast({ title: t('documents.uploadSuccess') });
      queryClient.invalidateQueries({ queryKey: ['site-documents', siteId] });
      setShowUploadModal(false);
      resetForm();
    } catch (err: any) {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (filePath: string) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: t('common.error'), description: error?.message, variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async () => {
    if (!deletingDoc) return;
    try {
      await supabase.storage.from('documents').remove([deletingDoc.file_path]);
      const { error } = await supabase.from('documents').delete().eq('id', deletingDoc.id);
      if (error) throw error;
      toast({ title: t('documents.deleteSuccess') });
      queryClient.invalidateQueries({ queryKey: ['site-documents', siteId] });
    } catch (err: any) {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    } finally {
      setDeletingDoc(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowUploadModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('documents.upload')}
        </Button>
      </div>

      {!documents || documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('documents.empty')}</h3>
            <Button onClick={() => setShowUploadModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('documents.upload')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('documents.name')}</TableHead>
                <TableHead>{t('documents.type')}</TableHead>
                <TableHead>{t('documents.size')}</TableHead>
                <TableHead>{t('documents.date')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc: any) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {doc.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {doc.doc_type && (
                      <Badge variant="outline" className={docTypeBadgeColors[doc.doc_type] || docTypeBadgeColors.other}>
                        {String(t(`documents.types.${doc.doc_type}`, { defaultValue: doc.doc_type }))}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                  <TableCell>{format(new Date(doc.created_at), 'dd/MM/yyyy')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(doc.file_path)} title={t('documents.download')}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeletingDoc({ id: doc.id, name: doc.name, file_path: doc.file_path })} title={t('documents.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={(open) => { setShowUploadModal(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('documents.upload')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('documents.name')} *</Label>
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder={t('documents.name')} />
            </div>
            <div className="space-y-2">
              <Label>{t('documents.type')}</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{t(`documents.types.${type}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('documents.file')} *</Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">PDF, DOC, XLS, IMG — Max 20MB</p>
            </div>
            <div className="space-y-2">
              <Label>{t('documents.notes')}</Label>
              <Textarea value={docNotes} onChange={(e) => setDocNotes(e.target.value)} placeholder={t('documents.notes')} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadModal(false); resetForm(); }}>{t('common.cancel')}</Button>
            <Button onClick={handleUpload} disabled={!docName.trim() || !docFile || uploading}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('documents.upload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDoc} onOpenChange={(open) => !open && setDeletingDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('siteDetail.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {String(t('documents.deleteConfirm', { name: deletingDoc?.name }))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
