import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  HardHat,
  Camera,
  ClipboardCheck,
  BarChart3,
  Plane,
  Settings,
  LogOut,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AppSidebar() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const mainItems = [
    { title: t('nav.dashboard'), url: '/app', icon: LayoutDashboard },
    { title: t('nav.organizations'), url: '/app/organizations', icon: Building2 },
    { title: t('nav.sites'), url: '/app/sites', icon: HardHat },
    { title: t('nav.captures'), url: '/app/captures', icon: Camera },
    { title: t('nav.inspections'), url: '/app/inspections', icon: ClipboardCheck },
    { title: t('nav.nonconformities'), url: '/app/nonconformities', icon: AlertTriangle },
    { title: t('nav.reports'), url: '/app/reports', icon: BarChart3 },
  ];

  const futureItems = [
    { title: t('nav.drone'), url: '/app/drone', icon: Plane, badge: t('nav.comingSoon') },
  ];

  const isActive = (path: string) => {
    if (path === '/app') {
      return location.pathname === '/app';
    }
    return location.pathname.startsWith(path);
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="border-b border-border/50 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary flex-shrink-0">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold gradient-text">{t('brand.name')}</span>
              <span className="text-xs text-muted-foreground">{t('brand.tagline')}</span>
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
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={isCollapsed ? item.title : undefined}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === '/app'}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary"
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
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
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={isCollapsed ? item.title : undefined}
                  >
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-muted/50 opacity-60"
                      activeClassName="bg-primary/10 text-primary"
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{item.title}</span>
                          {item.badge && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
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
                <SidebarMenuButton
                  asChild
                  isActive={isActive('/app/settings')}
                  tooltip={isCollapsed ? t('nav.settings') : undefined}
                >
                  <NavLink
                    to="/app/settings"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-muted/50"
                    activeClassName="bg-primary/10 text-primary"
                  >
                    <Settings className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span>{t('nav.settings')}</span>}
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
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-2 py-6 h-auto hover:bg-muted/50"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex flex-col items-start text-left overflow-hidden">
                  <span className="text-sm font-medium truncate w-full">{user?.email}</span>
                  <span className="text-xs text-muted-foreground">Online</span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 glass">
            <DropdownMenuItem onClick={() => navigate('/app/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              {t('nav.settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
