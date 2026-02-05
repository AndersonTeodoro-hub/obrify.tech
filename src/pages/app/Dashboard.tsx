import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  HardHat,
  Camera,
  ClipboardCheck,
  AlertTriangle,
  Plus,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SitesWithNCs } from '@/components/dashboard/SitesWithNCs';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check if user has any organizations
  const { data: memberships, isLoading: loadingMemberships } = useQuery({
    queryKey: ['user-memberships', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, organizations(*)')
        .eq('user_id', user?.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Get stats if user has organizations
  const hasOrganizations = memberships && memberships.length > 0;
  const orgIds = memberships?.map(m => m.org_id) || [];

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', orgIds],
    queryFn: async () => {
      const [sitesRes, capturesRes, inspectionsRes, nonconformitiesRes] = await Promise.all([
        supabase.from('sites').select('id', { count: 'exact' }).in('org_id', orgIds),
        supabase.from('captures').select('id', { count: 'exact' }),
        supabase.from('inspections').select('id', { count: 'exact' }),
        supabase.from('nonconformities').select('id', { count: 'exact' }),
      ]);

      return {
        sites: sitesRes.count || 0,
        captures: capturesRes.count || 0,
        inspections: inspectionsRes.count || 0,
        nonconformities: nonconformitiesRes.count || 0,
      };
    },
    enabled: hasOrganizations,
  });

  const { data: recentSites } = useQuery({
    queryKey: ['recent-sites', orgIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .in('org_id', orgIds)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data;
    },
    enabled: hasOrganizations,
  });

  if (loadingMemberships) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Empty state - no organizations
  if (!hasOrganizations) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-100 to-accent-100 dark:from-primary-900/30 dark:to-accent-900/30 flex items-center justify-center">
          <Activity className="w-10 h-10 text-primary-600 dark:text-primary-400" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t('dashboard.welcome')}</h1>
          <p className="text-muted-foreground">{t('dashboard.noOrganization')}</p>
          <p className="text-sm text-muted-foreground">{t('dashboard.getStarted')}</p>
        </div>

        <Button
          size="lg"
          variant="accent"
          onClick={() => navigate('/app/organizations')}
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('dashboard.createFirstOrg')}
        </Button>
      </div>
    );
  }

  // Dashboard with data - Stat cards configuration
  const statCards = [
    { 
      title: t('dashboard.totalSites'), 
      value: stats?.sites || 0, 
      icon: HardHat, 
      iconBg: 'bg-primary-100 dark:bg-primary-900/30',
      iconColor: 'text-primary-600 dark:text-primary-400'
    },
    { 
      title: t('dashboard.pendingCaptures'), 
      value: stats?.captures || 0, 
      icon: Camera, 
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400'
    },
    { 
      title: t('dashboard.inspections'), 
      value: stats?.inspections || 0, 
      icon: ClipboardCheck, 
      iconBg: 'bg-accent-100 dark:bg-accent-900/30',
      iconColor: 'text-accent-600 dark:text-accent-400'
    },
    { 
      title: t('dashboard.nonConformities'), 
      value: stats?.nonconformities || 0, 
      icon: AlertTriangle, 
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400'
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">{t('dashboard.welcomeDesc')}</p>
      </div>

      {/* Stats Grid - Premium Design with Staggered Animation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card 
            key={stat.title} 
            className={cn(
              "group hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 opacity-0 animate-fade-in-up",
              index === 0 && "animation-delay-0",
              index === 1 && "animation-delay-100",
              index === 2 && "animation-delay-200",
              index === 3 && "animation-delay-300"
            )}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400">
                    {stat.title}
                  </p>
                  <p className="text-4xl font-light tracking-tight text-foreground">
                    {stat.value}
                  </p>
                </div>
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
                  stat.iconBg
                )}>
                  <stat.icon className={cn("w-6 h-6", stat.iconColor)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sites */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('dashboard.recentSites')}</CardTitle>
              <CardDescription>{t('sites.subtitle')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/app/sites')}>
              {t('dashboard.viewAllSites')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentSites && recentSites.length > 0 ? (
              <div className="space-y-3">
                {recentSites.map((site) => (
                  <div
                    key={site.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/app/sites/${site.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <HardHat className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div>
                        <p className="font-medium">{site.name}</p>
                        <p className="text-sm text-muted-foreground">{site.address || 'Sem morada'}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <HardHat className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('sites.noSites')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate('/app/captures')}
            >
              <Camera className="w-5 h-5 text-green-600 dark:text-green-400" />
              {t('dashboard.newCapture')}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate('/app/inspections')}
            >
              <ClipboardCheck className="w-5 h-5 text-accent-600 dark:text-accent-400" />
              {t('dashboard.newInspection')}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate('/app/sites')}
            >
              <HardHat className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              {t('sites.create')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Sites with Open NCs */}
      <SitesWithNCs orgIds={orgIds} />
    </div>
  );
}
