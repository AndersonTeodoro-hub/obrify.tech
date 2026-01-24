import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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
          // For IDs or unknown segments, keep as is
          break;
      }

      breadcrumbs.push({ label, path: currentPath, isLast });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="h-14 border-b border-border/50 bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="h-8 w-8" />
        
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <BreadcrumbItem key={crumb.path}>
                {!crumb.isLast ? (
                  <>
                    <BreadcrumbLink href={crumb.path} className="text-muted-foreground hover:text-foreground">
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

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
