import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { pt, enUS, es, fr } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Copy, Trash2, ClipboardList } from 'lucide-react';

interface TemplateItem {
  id: string;
  title: string;
}

interface Template {
  id: string;
  name: string;
  category: string;
  items: TemplateItem[];
  lastUsed: string | null;
}

interface TemplateCardProps {
  template: Template;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const categoryColors: Record<string, string> = {
  structure: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  finishes: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  installations: 'bg-green-500/10 text-green-500 border-green-500/20',
  safety: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export function TemplateCard({ template, onEdit, onDelete, onDuplicate }: TemplateCardProps) {
  const { t, i18n } = useTranslation();

  const getLocale = () => {
    switch (i18n.language) {
      case 'pt': return pt;
      case 'es': return es;
      case 'fr': return fr;
      default: return enUS;
    }
  };

  const categoryKey = `templates.categories.${template.category}` as const;
  const categoryLabel = t(categoryKey);
  const categoryColor = categoryColors[template.category] || categoryColors.structure;

  return (
    <Card className="glass border-border/50 hover:border-primary/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold">{template.name}</CardTitle>
              <Badge variant="outline" className={categoryColor}>
                {categoryLabel}
              </Badge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                {t('templates.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {template.items.length} {t('templates.items')}
          </span>
          <span className="text-muted-foreground">
            {template.lastUsed 
              ? format(new Date(template.lastUsed), 'dd/MM/yyyy', { locale: getLocale() })
              : t('templates.neverUsed')
            }
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
