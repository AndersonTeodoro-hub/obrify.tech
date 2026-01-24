import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
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
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          <Activity className="w-10 h-10 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t('dashboard.welcome')}</h1>
          <p className="text-muted-foreground">{t('dashboard.noOrganization')}</p>
          <p className="text-sm text-muted-foreground">{t('dashboard.getStarted')}</p>
        </div>

        <Button
          size="lg"
          onClick={() => navigate('/app/organizations')}
          className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('dashboard.createFirstOrg')}
        </Button>
      </div>
    );
  }

  // Dashboard with data
  const statCards = [
    { title: t('dashboard.totalSites'), value: stats?.sites || 0, icon: HardHat, color: 'text-blue-500' },
    { title: t('dashboard.pendingCaptures'), value: stats?.captures || 0, icon: Camera, color: 'text-green-500' },
    { title: t('dashboard.inspections'), value: stats?.inspections || 0, icon: ClipboardCheck, color: 'text-purple-500' },
    { title: t('dashboard.nonConformities'), value: stats?.nonconformities || 0, icon: AlertTriangle, color: 'text-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">{t('dashboard.welcomeDesc')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="glass border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sites */}
        <Card className="lg:col-span-2 glass border-border/50">
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
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/app/sites/${site.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <HardHat className="w-5 h-5 text-primary" />
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
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate('/app/captures')}
            >
              <Camera className="w-5 h-5 text-green-500" />
              {t('dashboard.newCapture')}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate('/app/inspections')}
            >
              <ClipboardCheck className="w-5 h-5 text-purple-500" />
              {t('dashboard.newInspection')}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate('/app/sites')}
            >
              <HardHat className="w-5 h-5 text-blue-500" />
              {t('sites.create')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
