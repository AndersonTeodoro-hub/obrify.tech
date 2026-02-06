import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

interface ProjectConflictsSummaryProps {
  siteId: string;
  conflicts: Array<{
    id: string;
    severity: string;
    status: string;
  }>;
}

const SEVERITY_CONFIG: Record<string, { label: string; class: string }> = {
  critical: { label: 'Crítico', class: 'bg-destructive/20 text-destructive border-destructive/30' },
  high: { label: 'Alto', class: 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30' },
  medium: { label: 'Médio', class: 'bg-info/20 text-info border-info/30' },
  low: { label: 'Baixo', class: 'bg-muted text-muted-foreground border-border' },
};

export function ProjectConflictsSummary({ conflicts }: ProjectConflictsSummaryProps) {
  const active = conflicts.filter(c => c.status !== 'resolved' && c.status !== 'dismissed');
  
  if (active.length === 0) return null;

  const bySeverity = active.reduce((acc, c) => {
    acc[c.severity] = (acc[c.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">
              {active.length} incompatibilidade{active.length !== 1 ? 's' : ''} detectada{active.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              {Object.entries(SEVERITY_CONFIG).map(([key, config]) => {
                const count = bySeverity[key];
                if (!count) return null;
                return (
                  <Badge key={key} variant="outline" className={config.class}>
                    {count} {config.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
