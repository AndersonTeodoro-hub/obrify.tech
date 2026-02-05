import { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocalItem {
  tempId: string;
  id?: string;
  item_code: string;
  title: string;
  item_type: string;
  is_required: boolean;
}

interface TemplateItemEditorProps {
  item: LocalItem;
  onUpdate: (updates: Partial<LocalItem>) => void;
  onRemove: () => void;
  isDragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

const itemTypes = ['checkbox', 'text', 'number'];

export function TemplateItemEditor({
  item,
  onUpdate,
  onRemove,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TemplateItemEditorProps) {
  const { t } = useTranslation();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        'flex items-center gap-3 p-3 border rounded-lg bg-card transition-all',
        isDragging && 'opacity-50 border-primary',
        'hover:border-primary/30'
      )}
    >
      <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </div>

      <Input
        value={item.title}
        onChange={e => onUpdate({ title: e.target.value })}
        placeholder={t('templates.itemText')}
        className="flex-1"
      />

      <Select value={item.item_type} onValueChange={value => onUpdate({ item_type: value })}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {itemTypes.map(type => (
            <SelectItem key={type} value={type}>
              {t(`templates.itemTypes.${type}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`required-${item.tempId}`}
          checked={item.is_required}
          onCheckedChange={checked => onUpdate({ is_required: checked as boolean })}
        />
        <Label 
          htmlFor={`required-${item.tempId}`} 
          className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
        >
          {t('templates.required')}
        </Label>
      </div>

      <Button variant="ghost" size="icon" onClick={onRemove} className="text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
