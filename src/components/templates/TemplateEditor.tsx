import { useState, useEffect, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { TemplateItemEditor } from './TemplateItemEditor';

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
  items: TemplateItem[];
}

interface LocalItem {
  tempId: string;
  id?: string;
  item_code: string;
  title: string;
  item_type: string;
  is_required: boolean;
}

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
  orgId: string;
}

const categories = ['structure', 'finishes', 'installations', 'safety'];

export function TemplateEditor({ open, onOpenChange, template, orgId }: TemplateEditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('structure');
  const [items, setItems] = useState<LocalItem[]>([]);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setCategory(template.category || 'structure');
      setItems(
        template.items.map(item => ({
          tempId: item.id,
          id: item.id,
          item_code: item.item_code,
          title: item.title,
          item_type: item.item_type || 'checkbox',
          is_required: item.is_required || false,
        }))
      );
    } else {
      setName('');
      setCategory('structure');
      setItems([]);
    }
  }, [template, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name required');

      if (template) {
        // Update existing template
        const { error: templateError } = await supabase
          .from('inspection_templates')
          .update({ name, category })
          .eq('id', template.id);

        if (templateError) throw templateError;

        // Delete existing items
        await supabase
          .from('inspection_template_items')
          .delete()
          .eq('template_id', template.id);

        // Insert updated items
        if (items.length > 0) {
          const newItems = items.map((item, index) => ({
            template_id: template.id,
            item_code: item.item_code || `ITEM-${index + 1}`,
            title: item.title,
            item_type: item.item_type,
            is_required: item.is_required,
            order_index: index,
          }));

          const { error: itemsError } = await supabase
            .from('inspection_template_items')
            .insert(newItems);

          if (itemsError) throw itemsError;
        }
      } else {
        // Create new template
        const { data: newTemplate, error: templateError } = await supabase
          .from('inspection_templates')
          .insert({
            name,
            category,
            org_id: orgId,
            version: 1,
          })
          .select()
          .single();

        if (templateError) throw templateError;

        // Insert items
        if (items.length > 0) {
          const newItems = items.map((item, index) => ({
            template_id: newTemplate.id,
            item_code: item.item_code || `ITEM-${index + 1}`,
            title: item.title,
            item_type: item.item_type,
            is_required: item.is_required,
            order_index: index,
          }));

          const { error: itemsError } = await supabase
            .from('inspection_template_items')
            .insert(newItems);

          if (itemsError) throw itemsError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-templates'] });
      toast.success(template ? t('templates.updated') : t('templates.created'));
      onOpenChange(false);
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleAddItem = () => {
    const newItem: LocalItem = {
      tempId: crypto.randomUUID(),
      item_code: `ITEM-${items.length + 1}`,
      title: '',
      item_type: 'checkbox',
      is_required: false,
    };
    setItems([...items, newItem]);
  };

  const handleUpdateItem = (tempId: string, updates: Partial<LocalItem>) => {
    setItems(items.map(item => 
      item.tempId === tempId ? { ...item, ...updates } : item
    ));
  };

  const handleRemoveItem = (tempId: string) => {
    setItems(items.filter(item => item.tempId !== tempId));
  };

  // Drag and drop handlers
  const handleDragStart = (e: DragEvent<HTMLDivElement>, tempId: string) => {
    setDraggedItemId(tempId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetTempId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetTempId) return;

    const draggedIndex = items.findIndex(item => item.tempId === draggedItemId);
    const targetIndex = items.findIndex(item => item.tempId === targetTempId);

    const newItems = [...items];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, removed);

    setItems(newItems);
    setDraggedItemId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {template ? t('templates.edit') : t('templates.new')}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <Label htmlFor="template-name">{t('templates.name')}</Label>
            <Input
              id="template-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('templates.namePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('templates.category')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {t(`templates.categories.${cat}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('templates.items')}</Label>
              <Button variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="h-4 w-4 mr-2" />
                {t('templates.addItem')}
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('templates.noItems')}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t('templates.dragToReorder')}
                </p>
                {items.map(item => (
                  <TemplateItemEditor
                    key={item.tempId}
                    item={item}
                    onUpdate={updates => handleUpdateItem(item.tempId, updates)}
                    onRemove={() => handleRemoveItem(item.tempId)}
                    isDragging={draggedItemId === item.tempId}
                    onDragStart={e => handleDragStart(e, item.tempId)}
                    onDragOver={handleDragOver}
                    onDrop={e => handleDrop(e, item.tempId)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={() => saveMutation.mutate()} 
            disabled={!name.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending ? t('common.loading') : t('common.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
