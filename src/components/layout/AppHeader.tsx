import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AlertBell } from '@/components/layout/AlertBell';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export function AppHeader() {
  const { t } = useTranslation();
  const location = useLocation();

  const getBreadcrumbs = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs: { label: string; path: string; isLast: boolean }[] = [];

    let currentPath = '';
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === pathSegments.length - 1;

      let label = segment;
      switch (segment) {
        case 'app':
          label = t('nav.dashboard');
          break;
        case 'organizations':
          label = t('nav.organizations');
          break;
        case 'sites':
          label = t('nav.sites');
          break;
        case 'captures':
          label = t('nav.captures');
          break;
        case 'inspections':
          label = t('nav.inspections');
          break;
        case 'reports':
          label = t('nav.reports');
          break;
        case 'drone':
          label = t('nav.drone');
          break;
        case 'settings':
          label = t('nav.settings');
          break;
        default:
          break;
      }

      breadcrumbs.push({ label, path: currentPath, isLast });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="h-16 border-b border-border/50 bg-background/95 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" />
        
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <BreadcrumbItem key={crumb.path}>
                {!crumb.isLast ? (
                  <>
                    <BreadcrumbLink href={crumb.path} className="text-muted-foreground hover:text-foreground transition-colors">
                      {crumb.label}
                    </BreadcrumbLink>
                    {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                  </>
                ) : (
                  <BreadcrumbPage className="font-medium">{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Search Bar */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('common.search') || 'Pesquisar...'}
            className="w-full h-9 pl-10 pr-4 rounded-full bg-slate-100 dark:bg-slate-900 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <AlertBell />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
