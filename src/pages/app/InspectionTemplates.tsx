import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { TemplateCard } from '@/components/templates/TemplateCard';
import { TemplateEditor } from '@/components/templates/TemplateEditor';
import { DeleteConfirmDialog } from '@/components/sites/DeleteConfirmDialog';

interface TemplateItem {
  id: string;
  item_code: string;
  title: string;
  description: string | null;
  section: string | null;
  item_type: string;
  is_required: boolean;
  order_index: number;
}

interface Template {
  id: string;
  name: string;
  category: string;
  version: number;
  org_id: string;
  created_at: string;
  items: TemplateItem[];
  lastUsed: string | null;
}

export default function InspectionTemplates() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  // Get user's org_id
  const { data: membership } = useQuery({
    queryKey: ['user-membership', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user!.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch templates with items and last used date
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['inspection-templates', membership?.org_id],
    queryFn: async () => {
      const { data: templatesData, error: templatesError } = await supabase
        .from('inspection_templates')
        .select(`
          id,
          name,
          category,
          version,
          org_id,
          created_at,
          inspection_template_items (
            id,
            item_code,
            title,
            description,
            section,
            item_type,
            is_required,
            order_index
          )
        `)
        .eq('org_id', membership!.org_id)
        .order('name');

      if (templatesError) throw templatesError;

      // Get last used dates for each template
      const { data: inspections } = await supabase
        .from('inspections')
        .select('template_id, created_at')
        .order('created_at', { ascending: false });

      const lastUsedMap: Record<string, string> = {};
      inspections?.forEach(insp => {
        if (!lastUsedMap[insp.template_id]) {
          lastUsedMap[insp.template_id] = insp.created_at;
        }
      });

      return templatesData.map(template => ({
        ...template,
        category: template.category || 'structure',
        items: (template.inspection_template_items || []).sort((a, b) => 
          (a.order_index || 0) - (b.order_index || 0)
        ),
        lastUsed: lastUsedMap[template.id] || null,
      })) as Template[];
    },
    enabled: !!membership?.org_id,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      // First delete all items
      await supabase
        .from('inspection_template_items')
        .delete()
        .eq('template_id', templateId);
      
      // Then delete template
      const { error } = await supabase
        .from('inspection_templates')
        .delete()
        .eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-templates'] });
      toast.success(t('templates.deleted'));
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: async (template: Template) => {
      // Create new template
      const { data: newTemplate, error: templateError } = await supabase
        .from('inspection_templates')
        .insert({
          name: `${template.name} (Cópia)`,
          category: template.category,
          org_id: template.org_id,
          version: 1,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Duplicate items
      if (template.items.length > 0) {
        const newItems = template.items.map((item, index) => ({
          template_id: newTemplate.id,
          item_code: item.item_code,
          title: item.title,
          description: item.description,
          section: item.section,
          item_type: item.item_type || 'checkbox',
          is_required: item.is_required || false,
          order_index: index,
        }));

        const { error: itemsError } = await supabase
          .from('inspection_template_items')
          .insert(newItems);

        if (itemsError) throw itemsError;
      }

      return newTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-templates'] });
      toast.success(t('templates.created'));
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleEdit = (template: Template) => {
    setSelectedTemplate(template);
    setEditorOpen(true);
  };

  const handleDelete = (template: Template) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const handleDuplicate = (template: Template) => {
    duplicateMutation.mutate(template);
  };

  const handleNewTemplate = () => {
    setSelectedTemplate(null);
    setEditorOpen(true);
  };

  const handleEditorClose = () => {
    setEditorOpen(false);
    setSelectedTemplate(null);
  };

  if (!membership?.org_id) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/app/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{t('templates.title')}</h1>
            <p className="text-muted-foreground">{t('templates.subtitle')}</p>
          </div>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          {t('dashboard.noOrganization')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/app/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{t('templates.title')}</h1>
            <p className="text-muted-foreground">{t('templates.subtitle')}</p>
          </div>
        </div>
        <Button onClick={handleNewTemplate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('templates.new')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">{t('templates.noTemplates')}</p>
          <Button onClick={handleNewTemplate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('templates.new')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => handleEdit(template)}
              onDelete={() => handleDelete(template)}
              onDuplicate={() => handleDuplicate(template)}
            />
          ))}
        </div>
      )}

      <TemplateEditor
        open={editorOpen}
        onOpenChange={handleEditorClose}
        template={selectedTemplate}
        orgId={membership.org_id}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('siteDetail.deleteConfirmTitle')}
        description={t('templates.deleteConfirm', { name: templateToDelete?.name })}
        onConfirm={() => templateToDelete && deleteMutation.mutate(templateToDelete.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
