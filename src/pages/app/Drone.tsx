 import { useState } from 'react';
 import { useTranslation } from 'react-i18next';
 import { useQuery } from '@tanstack/react-query';
 import { Plane, Plus, MapPin, Clock, CheckCircle2, AlertCircle, Play, Camera } from 'lucide-react';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { supabase } from '@/integrations/supabase/client';
 import { AIChat } from '@/components/ai/AIChat';
 
 interface Drone {
   id: string;
   name: string;
   model: string;
   manufacturer: string;
   serial_number: string | null;
   status: string;
   total_flight_hours: number;
   battery_cycles: number;
 }
 
 interface DroneMission {
   id: string;
   name: string;
   mission_type: string;
   status: string;
   altitude_meters: number;
   waypoints: any[];
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
 
 const statusLabels: Record<string, string> = {
   available: 'Disponível',
   in_mission: 'Em Missão',
   maintenance: 'Manutenção',
   offline: 'Offline',
   draft: 'Rascunho',
   planned: 'Planeada',
   executing: 'Em Execução',
   completed: 'Concluída',
   failed: 'Falhou',
 };
 
 const missionTypeLabels: Record<string, string> = {
   medicao: 'Medição',
   inspecao_visual: 'Inspeção Visual',
   mapeamento_3d: 'Mapeamento 3D',
   timelapse: 'Timelapse',
 };
 
 export default function Drone() {
   const { t } = useTranslation();
   const [activeTab, setActiveTab] = useState('chat');
 
   const { data: drones = [], isLoading: loadingDrones } = useQuery({
     queryKey: ['drones'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('drones')
         .select('*')
         .order('created_at', { ascending: false });
       if (error) throw error;
       return data as Drone[];
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
 
   const stats = {
     totalDrones: drones.length,
     availableDrones: drones.filter(d => d.status === 'available').length,
     totalMissions: missions.length,
     completedMissions: missions.filter(m => m.status === 'completed').length,
   };
 
   return (
     <div className="space-y-6">
       {/* Header */}
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-bold">{t('nav.drone')}</h1>
           <p className="text-muted-foreground">Gestão de drones e missões automatizadas com IA</p>
         </div>
         <Button className="gap-2">
           <Plus className="w-4 h-4" />
           Registar Drone
         </Button>
       </div>
 
       {/* Stats */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <Card className="border-border/50">
           <CardContent className="pt-6">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                 <Plane className="w-5 h-5 text-primary" />
               </div>
               <div>
                 <p className="text-2xl font-bold">{stats.totalDrones}</p>
                 <p className="text-xs text-muted-foreground">Drones Registados</p>
               </div>
             </div>
           </CardContent>
         </Card>
         <Card className="border-border/50">
           <CardContent className="pt-6">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                 <CheckCircle2 className="w-5 h-5 text-green-500" />
               </div>
               <div>
                 <p className="text-2xl font-bold">{stats.availableDrones}</p>
                 <p className="text-xs text-muted-foreground">Disponíveis</p>
               </div>
             </div>
           </CardContent>
         </Card>
         <Card className="border-border/50">
           <CardContent className="pt-6">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                 <MapPin className="w-5 h-5 text-blue-500" />
               </div>
               <div>
                 <p className="text-2xl font-bold">{stats.totalMissions}</p>
                 <p className="text-xs text-muted-foreground">Missões Totais</p>
               </div>
             </div>
           </CardContent>
         </Card>
         <Card className="border-border/50">
           <CardContent className="pt-6">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                 <Camera className="w-5 h-5 text-accent" />
               </div>
               <div>
                 <p className="text-2xl font-bold">{stats.completedMissions}</p>
                 <p className="text-xs text-muted-foreground">Concluídas</p>
               </div>
             </div>
           </CardContent>
         </Card>
       </div>
 
       {/* Main Content */}
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* AI Chat */}
         <AIChat className="h-[500px]" />
 
         {/* Tabs for Drones and Missions */}
         <Card className="border-border/50 h-[500px] flex flex-col">
           <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
             <CardHeader className="pb-0">
               <TabsList className="grid w-full grid-cols-2">
                 <TabsTrigger value="chat">Equipamentos</TabsTrigger>
                 <TabsTrigger value="missions">Missões</TabsTrigger>
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
                     <p className="text-muted-foreground">Nenhum drone registado</p>
                     <p className="text-sm text-muted-foreground mt-1">
                       Registe o seu primeiro drone para começar
                     </p>
                   </div>
                 ) : (
                   drones.map((drone) => (
                     <div
                       key={drone.id}
                       className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors"
                     >
                       <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                         <Plane className="w-6 h-6 text-primary" />
                       </div>
                       <div className="flex-1 min-w-0">
                         <p className="font-medium truncate">{drone.name}</p>
                         <p className="text-sm text-muted-foreground">
                           {drone.manufacturer} {drone.model}
                         </p>
                       </div>
                       <div className="text-right">
                         <Badge variant="outline" className={statusColors[drone.status]}>
                           {statusLabels[drone.status] || drone.status}
                         </Badge>
                         <p className="text-xs text-muted-foreground mt-1">
                           {drone.total_flight_hours}h de voo
                         </p>
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
                     <p className="text-muted-foreground">Nenhuma missão planeada</p>
                     <p className="text-sm text-muted-foreground mt-1">
                       Use o chat IA para criar missões automaticamente
                     </p>
                   </div>
                 ) : (
                   missions.map((mission) => (
                     <div
                       key={mission.id}
                       className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors"
                     >
                       <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                         {mission.status === 'executing' ? (
                           <Play className="w-6 h-6 text-blue-500" />
                         ) : mission.status === 'completed' ? (
                           <CheckCircle2 className="w-6 h-6 text-green-500" />
                         ) : mission.status === 'failed' ? (
                           <AlertCircle className="w-6 h-6 text-red-500" />
                         ) : (
                           <Clock className="w-6 h-6 text-blue-500" />
                         )}
                       </div>
                       <div className="flex-1 min-w-0">
                         <p className="font-medium truncate">{mission.name}</p>
                         <p className="text-sm text-muted-foreground">
                           {mission.site?.name || 'Sem obra'} • {missionTypeLabels[mission.mission_type] || mission.mission_type}
                         </p>
                       </div>
                       <div className="text-right">
                         <Badge variant="outline" className={statusColors[mission.status]}>
                           {statusLabels[mission.status] || mission.status}
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
     </div>
   );
 }
