import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type DateFilter = 'all' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth';

interface InspectionFiltersProps {
  sites: Array<{ id: string; name: string }>;
  siteFilter: string;
  onSiteFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (value: DateFilter) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function InspectionFilters({
  sites,
  siteFilter,
  onSiteFilterChange,
  statusFilter,
  onStatusFilterChange,
  dateFilter,
  onDateFilterChange,
  hasActiveFilters,
  onClearFilters,
}: InspectionFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Site Filter */}
      <Select value={siteFilter} onValueChange={onSiteFilterChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t('inspections.filterBySite')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('inspections.allSites')}</SelectItem>
          {sites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status Filter */}
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t('inspections.filterByStatus')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('inspections.allStatuses')}</SelectItem>
          <SelectItem value="draft">{t('inspections.statusDraft')}</SelectItem>
          <SelectItem value="in_progress">{t('inspections.statusInProgress')}</SelectItem>
          <SelectItem value="completed">{t('inspections.statusCompleted')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Date Filter */}
      <Select value={dateFilter} onValueChange={(v) => onDateFilterChange(v as DateFilter)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t('inspections.filterByDate')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('inspections.allDates')}</SelectItem>
          <SelectItem value="last7">{t('inspections.last7Days')}</SelectItem>
          <SelectItem value="last30">{t('inspections.last30Days')}</SelectItem>
          <SelectItem value="thisMonth">{t('inspections.thisMonth')}</SelectItem>
          <SelectItem value="lastMonth">{t('inspections.lastMonth')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          <X className="w-4 h-4 mr-2" />
          {t('inspections.clearFilters')}
        </Button>
      )}
    </div>
  );
}
