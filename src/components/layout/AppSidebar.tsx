import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Building2, HardHat, Camera, ClipboardCheck, BarChart3, Plane, Settings, LogOut, AlertTriangle, Search, BookOpen,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AppSidebar() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('full_name, avatar_url').eq('user_id', user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const mainItems = [
    { title: t('nav.dashboard'), url: '/app', icon: LayoutDashboard },
    { title: t('nav.organizations'), url: '/app/organizations', icon: Building2 },
    { title: t('nav.sites'), url: '/app/sites', icon: HardHat },
    { title: t('nav.captures'), url: '/app/captures', icon: Camera },
    { title: t('nav.inspections'), url: '/app/inspections', icon: ClipboardCheck },
    { title: t('nav.nonconformities'), url: '/app/nonconformities', icon: AlertTriangle },
    { title: t('nav.reports'), url: '/app/reports', icon: BarChart3 },
  ];

  const toolItems = [
    { title: 'Análise de Incompatibilidades', url: '/app/incompaticheck', icon: Search, badge: 'Novo' },
    { title: 'Conhecimento do Projecto', url: '/app/project-knowledge', icon: BookOpen },
  ];

  const futureItems = [
    { title: t('nav.drone'), url: '/app/drone', icon: Plane, badge: t('nav.comingSoon') },
  ];

  const isActive = (path: string) => path === '/app' ? location.pathname === '/app' : location.pathname.startsWith(path);

  const displayName = profile?.full_name || user?.email || 'U';
  const userInitials = displayName.slice(0, 2).toUpperCase();

  const handleSignOut = async () => { await signOut(); navigate('/auth'); };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50 transition-all duration-300" data-tour="sidebar">
      <SidebarHeader className="border-b border-border/50 p-4">
        <div className="flex items-center gap-3">
          <img src="/images/obrify-logo.jpeg" alt="Obrify" className="w-10 h-10 rounded-xl shadow-sm flex-shrink-0 object-cover" />
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-foreground">{t('brand.name')}</span>
              <span className="text-xs text-muted-foreground">Fiscalização Inteligente</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider px-2">
            {!isCollapsed && 'Menu'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={isCollapsed ? item.title : undefined}>
                    <NavLink to={item.url} end={item.url === '/app'} className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800" activeClassName="bg-gradient-to-r from-accent-100 to-transparent dark:from-slate-800/50 text-accent-600 dark:text-accent-400"
                      data-tour={item.url === '/app/sites' ? 'sites' : item.url === '/app/captures' ? 'captures' : item.url === '/app/inspections' ? 'inspections' : item.url === '/app/nonconformities' ? 'nonconformities' : item.url === '/app/reports' ? 'reports' : undefined}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && <span className="font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider px-2">
            {!isCollapsed && 'Ferramentas'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={isCollapsed ? item.title : undefined}>
                    <NavLink to={item.url} className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800" activeClassName="bg-gradient-to-r from-accent-100 to-transparent dark:from-slate-800/50 text-accent-600 dark:text-accent-400">
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && (<><span className="flex-1 font-medium">{item.title}</span><Badge className="text-[10px] px-1.5 py-0 bg-orange-500 text-white border-orange-500">{item.badge}</Badge></>)}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider px-2">
            {!isCollapsed && 'Fase 2'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {futureItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={isCollapsed ? item.title : undefined}>
                    <NavLink to={item.url} className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-60" activeClassName="bg-gradient-to-r from-accent-100 to-transparent dark:from-slate-800/50 text-accent-600 dark:text-accent-400">
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && (<><span className="flex-1 font-medium">{item.title}</span>{item.badge && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.badge}</Badge>}</>)}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/app/settings')} tooltip={isCollapsed ? t('nav.settings') : undefined}>
                  <NavLink to="/app/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800" activeClassName="bg-gradient-to-r from-accent-100 to-transparent dark:from-slate-800/50 text-accent-600 dark:text-accent-400">
                    <Settings className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span className="font-medium">{t('nav.settings')}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 px-2 py-6 h-auto hover:bg-slate-100 dark:hover:bg-slate-800">
              <Avatar className="w-8 h-8">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-accent-500 to-accent-600 text-white text-sm font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex flex-col items-start text-left overflow-hidden">
                  <span className="text-sm font-medium truncate w-full">{profile?.full_name || user?.email}</span>
                  <span className="text-xs text-muted-foreground">Online</span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 glass">
            <DropdownMenuItem onClick={() => navigate('/app/settings')}>
              <Settings className="w-4 h-4 mr-2" />{t('nav.settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />{t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
