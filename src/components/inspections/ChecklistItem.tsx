import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type InspectionResult = Database['public']['Enums']['inspection_result'];

interface TemplateItem {
  id: string;
  title: string;
  description: string | null;
  is_required: boolean | null;
  requires_evidence: boolean;
  order_index: number | null;
  item_code: string;
}

interface InspectionItem {
  id: string;
  result: InspectionResult | null;
  notes: string | null;
  template_item_id: string;
}

interface ChecklistItemProps {
  index: number;
  templateItem: TemplateItem;
  inspectionItem: InspectionItem | null;
  onResultChange: (templateItemId: string, result: InspectionResult | null, notes: string) => void;
  onAddPhoto: (templateItemId: string) => void;
  photoCount: number;
  isReadOnly: boolean;
  hasError?: boolean;
}

const resultOptions: { value: InspectionResult; labelKey: string; color: string }[] = [
  { value: 'OK', labelKey: 'inspections.detail.resultOK', color: 'bg-green-500/20 text-green-500 border-green-500/50 hover:bg-green-500/30' },
  { value: 'NC', labelKey: 'inspections.detail.resultNC', color: 'bg-red-500/20 text-red-500 border-red-500/50 hover:bg-red-500/30' },
  { value: 'OBS', labelKey: 'inspections.detail.resultOBS', color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/30' },
  { value: 'NA', labelKey: 'inspections.detail.resultNA', color: 'bg-muted text-muted-foreground border-border hover:bg-muted/80' },
];

export function ChecklistItem({
  index,
  templateItem,
  inspectionItem,
  onResultChange,
  onAddPhoto,
  photoCount,
  isReadOnly,
  hasError,
}: ChecklistItemProps) {
  const { t } = useTranslation();
  const [showNotes, setShowNotes] = useState(!!inspectionItem?.notes);
  const currentResult = inspectionItem?.result || null;
  const currentNotes = inspectionItem?.notes || '';

  const handleResultClick = (result: InspectionResult) => {
    if (isReadOnly) return;
    const newResult = currentResult === result ? null : result;
    onResultChange(templateItem.id, newResult, currentNotes);
  };

  const handleNotesChange = (notes: string) => {
    if (isReadOnly) return;
    onResultChange(templateItem.id, currentResult, notes);
  };

  return (
    <div 
      className={cn(
        "p-4 border rounded-lg transition-colors",
        hasError ? "border-red-500/50 bg-red-500/5" : "border-border",
        currentResult === 'NC' && "border-red-500/30 bg-red-500/5",
        currentResult === 'OK' && "border-green-500/30 bg-green-500/5"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">{templateItem.title}</p>
            {templateItem.is_required && (
              <Badge variant="outline" className="text-xs">
                {t('templates.required')}
              </Badge>
            )}
            {templateItem.requires_evidence && (
              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
                <Camera className="w-3 h-3 mr-1" />
                {t('inspections.detail.requiresEvidence')}
              </Badge>
            )}
          </div>
          {templateItem.description && (
            <p className="text-sm text-muted-foreground mt-1">{templateItem.description}</p>
          )}
        </div>
        {hasError && (
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        )}
      </div>

      {/* Result Buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        {resultOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            size="sm"
            disabled={isReadOnly}
            className={cn(
              "transition-all",
              currentResult === option.value ? option.color : "hover:bg-muted"
            )}
            onClick={() => handleResultClick(option.value)}
          >
            {t(option.labelKey)}
          </Button>
        ))}
      </div>

      {/* Notes Toggle & Field */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowNotes(!showNotes)}
          className="text-muted-foreground"
        >
          {showNotes ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
          {t('inspections.detail.observations')}
          {currentNotes && <span className="ml-1 text-primary">•</span>}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onAddPhoto(templateItem.id)}
          disabled={isReadOnly}
          className="text-muted-foreground"
        >
          <Camera className="w-4 h-4 mr-1" />
          {photoCount > 0 ? `${photoCount} ${t('captures.title').toLowerCase()}` : t('inspections.detail.attachPhoto')}
        </Button>
      </div>

      {showNotes && (
        <Textarea
          value={currentNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder={t('inspections.detail.observationsPlaceholder')}
          disabled={isReadOnly}
          className="mt-2 min-h-[80px]"
        />
      )}
    </div>
  );
}
