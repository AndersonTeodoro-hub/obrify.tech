import { useTranslation } from 'react-i18next';
import { MapPin, Building2, ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SiteHeaderProps {
  site: {
    id: string;
    name: string;
    address: string | null;
    status: string;
    organization?: { id: string; name: string } | null;
  };
  onEdit: () => void;
  onBack: () => void;
}

const statusStyles: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  paused: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export function SiteHeader({ site, onEdit, onBack }: SiteHeaderProps) {
  const { t } = useTranslation();

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return t('sites.statusActive');
      case 'paused':
        return t('sites.statusPaused');
      case 'completed':
        return t('sites.statusCompleted');
      default:
        return status;
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack}
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('siteDetail.backToSites')}
        </Button>
        
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {site.name}
          </h1>
          <Badge 
            variant="outline" 
            className={statusStyles[site.status] || statusStyles.active}
          >
            {getStatusLabel(site.status)}
          </Badge>
        </div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {site.address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>{site.address}</span>
            </div>
          )}
          {site.organization && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>{site.organization.name}</span>
            </div>
          )}
        </div>
      </div>

      <Button onClick={onEdit} className="shrink-0">
        <Pencil className="mr-2 h-4 w-4" />
        {t('siteDetail.editSite')}
      </Button>
    </div>
  );
}
