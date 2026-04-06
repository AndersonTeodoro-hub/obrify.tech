import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FloorPlanViewer } from './FloorPlanViewer';

interface SiteFloorPlanTabProps {
  siteId: string;
}

export function SiteFloorPlanTab({ siteId }: SiteFloorPlanTabProps) {
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');

  const { data: floors = [], isLoading } = useQuery({
    queryKey: ['site-floors-plan', siteId],
    queryFn: async () => {
      const { data } = await supabase
        .from('floors')
        .select('id, name, level')
        .eq('site_id', siteId)
        .order('level', { ascending: true });
      return data || [];
    },
  });

  // Auto-seleccionar primeiro floor
  if (floors.length > 0 && !selectedFloorId) {
    setSelectedFloorId(floors[0].id);
  }

  const selectedFloor = floors.find(f => f.id === selectedFloorId);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (floors.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Layers className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Crie pisos na tab Estrutura primeiro.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selector de piso */}
      <div className="flex items-center gap-3">
        <MapPin className="w-5 h-5 text-primary" />
        <Select value={selectedFloorId} onValueChange={setSelectedFloorId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Seleccionar piso" />
          </SelectTrigger>
          <SelectContent>
            {floors.map(floor => (
              <SelectItem key={floor.id} value={floor.id}>
                {floor.name}{floor.level !== null ? ` (Nível ${floor.level})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Viewer */}
      {selectedFloor && (
        <FloorPlanViewer
          siteId={siteId}
          floorId={selectedFloor.id}
          floorName={selectedFloor.name}
        />
      )}
    </div>
  );
}
