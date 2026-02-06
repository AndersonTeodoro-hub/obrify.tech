import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plane, Plus, MapPin, Clock, CheckCircle2, AlertCircle, Play, Camera, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { AIChat } from '@/components/ai/AIChat';
import { DroneFormModal } from '@/components/drones/DroneFormModal';

interface DroneType {
  id: string;
  name: string;
  model: string;
  manufacturer: string | null;
  serial_number: string | null;
  status: string;
  total_flight_hours: number | null;
  battery_cycles: number | null;
  purchase_date: string | null;
  notes: string | null;
  org_id: string;
}

interface DroneMission {
  id: string;
  name: string;
  mission_type: string;
  status: string;
  altitude_meters: number | null;
  waypoints: any[] | null;
  created_at: string;
  site: { name: string } | null;
}

const statusColors: Record<string, string> = {
  available: 'bg-green-500/10 text-green-500 border-green-500/20',
  in_mission: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  maintenance: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  offline: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  draft: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  planned: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  executing: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const missionTypeLabels: Record<string, string> = {
  medicao: 'Medição',
  inspecao_visual: 'Inspeção Visual',
  mapeamento_3d: 'Mapeamento 3D',
  timelapse: 'Timelapse',
};

export default function Drone() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('chat');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingDrone, setEditingDrone] = useState<DroneType | null>(null);
  const [deletingDrone, setDeletingDrone] = useState<DroneType | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Get user's org_id
  const { data: membership } = useQuery({
    queryKey: ['user-membership', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: drones = [], isLoading: loadingDrones } = useQuery({
    queryKey: ['drones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drones')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DroneType[];
    },
  });

  const { data: missions = [], isLoading: loadingMissions } = useQuery({
    queryKey: ['drone_missions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drone_missions')
        .select('*, site:sites(name)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as DroneMission[];
    },
  });

  const handleFormSubmit = async (formData: any) => {
    if (!membership?.org_id) {
      toast({ title: t('common.error'), description: 'No organization found', variant: 'destructive' });
      return;
    }
    setFormLoading(true);
    try {
      if (editingDrone) {
        const { error } = await supabase.from('drones').update({
          name: formData.name,
          manufacturer: formData.manufacturer || null,
          model: formData.model,
          serial_number: formData.serial_number || null,
          total_flight_hours: formData.total_flight_hours || 0,
          status: formData.status,
          notes: formData.notes || null,
          purchase_date: formData.purchase_date || null,
        } as any).eq('id', editingDrone.id);
        if (error) throw error;
        toast({ title: t('drones.updateSuccess') });
      } else {
        const { error } = await supabase.from('drones').insert({
          name: formData.name,
          manufacturer: formData.manufacturer || null,
          model: formData.model,
          serial_number: formData.serial_number || null,
          total_flight_hours: formData.total_flight_hours || 0,
          status: formData.status,
          notes: formData.notes || null,
          org_id: membership.org_id,
          purchase_date: formData.purchase_date || null,
        } as any);
        if (error) throw error;
        toast({ title: t('drones.registerSuccess') });
      }
      queryClient.invalidateQueries({ queryKey: ['drones'] });
      setShowFormModal(false);
      setEditingDrone(null);
    } catch (err: any) {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingDrone) return;
    try {
      const { error } = await supabase.from('drones').delete().eq('id', deletingDrone.id);
      if (error) throw error;
      toast({ title: t('drones.deleteSuccess') });
      queryClient.invalidateQueries({ queryKey: ['drones'] });
    } catch (err: any) {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    } finally {
      setDeletingDrone(null);
    }
  };

  const stats = {
    totalDrones: drones.length,
    availableDrones: drones.filter(d => d.status === 'available').length,
    inMission: drones.filter(d => d.status === 'in_mission').length,
    maintenance: drones.filter(d => d.status === 'maintenance').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.drone')}</h1>
          <p className="text-muted-foreground">{t('drones.subtitle')}</p>
        </div>
        <Button className="gap-2" onClick={() => { setEditingDrone(null); setShowFormModal(true); }}>
          <Plus className="w-4 h-4" />
          {t('drones.register')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Plane, value: stats.totalDrones, label: t('drones.totalDrones'), color: 'primary' },
          { icon: CheckCircle2, value: stats.availableDrones, label: t('drones.status.available'), color: 'green-500' },
          { icon: MapPin, value: stats.inMission, label: t('drones.status.inMission'), color: 'blue-500' },
          { icon: Clock, value: stats.maintenance, label: t('drones.status.maintenance'), color: 'yellow-500' },
        ].map((stat, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-${stat.color}/10 flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 text-${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AIChat className="h-[500px]" />

        <Card className="border-border/50 h-[500px] flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <CardHeader className="pb-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="chat">{t('drones.equipment')}</TabsTrigger>
                <TabsTrigger value="missions">{t('drones.missions')}</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto pt-4">
              <TabsContent value="chat" className="m-0 space-y-3">
                {loadingDrones ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : drones.length === 0 ? (
                  <div className="text-center py-12">
                    <Plane className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">{t('drones.noDrones')}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t('drones.registerFirst')}</p>
                  </div>
                ) : (
                  drones.map((drone) => (
                    <div key={drone.id} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <Plane className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{drone.name}</p>
                        <p className="text-sm text-muted-foreground">{drone.manufacturer} {drone.model}</p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <Badge variant="outline" className={statusColors[drone.status]}>
                            {t(`drones.status.${drone.status}`, drone.status)}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">{drone.total_flight_hours || 0}h</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingDrone(drone); setShowFormModal(true); }}>
                              <Pencil className="mr-2 h-4 w-4" /> {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeletingDrone(drone)}>
                              <Trash2 className="mr-2 h-4 w-4" /> {t('common.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="missions" className="m-0 space-y-3">
                {loadingMissions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : missions.length === 0 ? (
                  <div className="text-center py-12">
                    <MapPin className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">{t('drones.noMissions')}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t('drones.useChatForMissions')}</p>
                  </div>
                ) : (
                  missions.map((mission) => (
                    <div key={mission.id} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                        {mission.status === 'executing' ? <Play className="w-6 h-6 text-blue-500" /> :
                         mission.status === 'completed' ? <CheckCircle2 className="w-6 h-6 text-green-500" /> :
                         mission.status === 'failed' ? <AlertCircle className="w-6 h-6 text-red-500" /> :
                         <Clock className="w-6 h-6 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{mission.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {mission.site?.name || 'Sem obra'} • {missionTypeLabels[mission.mission_type] || mission.mission_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={statusColors[mission.status]}>
                          {t(`drones.status.${mission.status}`, mission.status)}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {mission.waypoints?.length || 0} waypoints • {mission.altitude_meters}m
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* Form Modal */}
      <DroneFormModal
        open={showFormModal}
        onOpenChange={(open) => { setShowFormModal(open); if (!open) setEditingDrone(null); }}
        onSubmit={handleFormSubmit}
        initialData={editingDrone ? {
          id: editingDrone.id,
          name: editingDrone.name,
          manufacturer: editingDrone.manufacturer || '',
          model: editingDrone.model,
          serial_number: editingDrone.serial_number || '',
          purchase_date: editingDrone.purchase_date || '',
          total_flight_hours: editingDrone.total_flight_hours || 0,
          status: editingDrone.status,
          notes: editingDrone.notes || '',
        } : null}
        loading={formLoading}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDrone} onOpenChange={(open) => !open && setDeletingDrone(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('siteDetail.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('drones.deleteConfirm', { name: deletingDrone?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
