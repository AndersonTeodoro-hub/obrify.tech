import { useTranslation } from 'react-i18next';
import { X, Image, Video, View } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CaptureFiltersState } from '@/types/captures';

interface Site {
  id: string;
  name: string;
}

interface Floor {
  id: string;
  name: string;
  level: number | null;
}

interface CaptureFiltersProps {
  filters: CaptureFiltersState;
  onFiltersChange: (filters: CaptureFiltersState) => void;
  sites: Site[];
  floors: Floor[];
  isLoadingFloors?: boolean;
}

export function CaptureFilters({
  filters,
  onFiltersChange,
  sites,
  floors,
  isLoadingFloors,
}: CaptureFiltersProps) {
  const { t } = useTranslation();

  const handleSiteChange = (value: string) => {
    onFiltersChange({
      ...filters,
      siteId: value === 'all' ? null : value,
      floorId: null, // Reset floor when site changes
    });
  };

  const handleFloorChange = (value: string) => {
    onFiltersChange({
      ...filters,
      floorId: value === 'all' ? null : value,
    });
  };

  const handleTypeChange = (value: string) => {
    onFiltersChange({
      ...filters,
      captureType: value as CaptureFiltersState['captureType'],
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      siteId: null,
      floorId: null,
      captureType: 'all',
      dateFrom: null,
      dateTo: null,
    });
  };

  const hasActiveFilters =
    filters.siteId || filters.floorId || filters.captureType !== 'all';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Site filter */}
      <Select
        value={filters.siteId || 'all'}
        onValueChange={handleSiteChange}
      >
        <SelectTrigger className="w-[180px] glass border-border/50">
          <SelectValue placeholder={t('captures.filterBySite')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('common.all')} {t('nav.sites')}</SelectItem>
          {sites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Floor filter - only show if site is selected */}
      {filters.siteId && (
        <Select
          value={filters.floorId || 'all'}
          onValueChange={handleFloorChange}
          disabled={isLoadingFloors}
        >
          <SelectTrigger className="w-[160px] glass border-border/50">
            <SelectValue placeholder={t('captures.filterByFloor')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')} {t('sites.floors')}</SelectItem>
            {floors.map((floor) => (
              <SelectItem key={floor.id} value={floor.id}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Type filter */}
      <Select
        value={filters.captureType}
        onValueChange={handleTypeChange}
      >
        <SelectTrigger className="w-[140px] glass border-border/50">
          <SelectValue placeholder={t('captures.filterByType')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('common.all')}</SelectItem>
          <SelectItem value="photo">
            <span className="flex items-center gap-2">
              <Image className="w-4 h-4 text-green-500" />
              {t('captures.photo')}
            </span>
          </SelectItem>
          <SelectItem value="video">
            <span className="flex items-center gap-2">
              <Video className="w-4 h-4 text-blue-500" />
              {t('captures.video')}
            </span>
          </SelectItem>
          <SelectItem value="panorama">
            <span className="flex items-center gap-2">
              <View className="w-4 h-4 text-purple-500" />
              {t('captures.panorama')}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Clear filters button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4 mr-1" />
          {t('captures.clearFilters')}
        </Button>
      )}
    </div>
  );
}
