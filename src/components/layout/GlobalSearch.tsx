import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, HardHat, AlertTriangle, ClipboardCheck, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

export function GlobalSearch() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Get user org IDs
  const { data: orgIds } = useQuery({
    queryKey: ['user-org-ids', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('memberships').select('org_id').eq('user_id', user?.id);
      return data?.map(m => m.org_id) || [];
    },
    enabled: !!user?.id,
  });

  // Search sites
  const { data: siteResults } = useQuery({
    queryKey: ['search-sites', debouncedQuery, orgIds],
    queryFn: async () => {
      if (!orgIds?.length) return [];
      const { data } = await supabase
        .from('sites')
        .select('id, name, address')
        .in('org_id', orgIds)
        .ilike('name', `%${debouncedQuery}%`)
        .limit(5);
      return data || [];
    },
    enabled: debouncedQuery.length >= 2 && !!orgIds?.length,
  });

  // Search NCs
  const { data: ncResults } = useQuery({
    queryKey: ['search-ncs', debouncedQuery, orgIds],
    queryFn: async () => {
      if (!orgIds?.length) return [];
      const { data } = await supabase
        .from('nonconformities')
        .select('id, title, severity, status')
        .ilike('title', `%${debouncedQuery}%`)
        .limit(5);
      return data || [];
    },
    enabled: debouncedQuery.length >= 2 && !!orgIds?.length,
  });

  const hasResults = (siteResults?.length || 0) + (ncResults?.length || 0) > 0;
  const showDropdown = isOpen && debouncedQuery.length >= 2;

  const handleSelect = useCallback((path: string) => {
    navigate(path);
    setQuery('');
    setIsOpen(false);
  }, [navigate]);

  return (
    <div ref={containerRef} className="hidden md:flex items-center flex-1 max-w-md mx-8 relative">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={t('common.search') || 'Pesquisar...'}
          className="w-full h-9 pl-10 pr-8 rounded-full bg-slate-100 dark:bg-slate-900 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(''); setIsOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden max-h-80 overflow-y-auto">
          {!hasResults ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('common.noResults', 'Sem resultados')}
            </div>
          ) : (
            <>
              {siteResults && siteResults.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                    {t('nav.sites')}
                  </div>
                  {siteResults.map((site) => (
                    <button
                      key={site.id}
                      onClick={() => handleSelect(`/app/sites/${site.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      <HardHat className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{site.name}</p>
                        {site.address && <p className="text-xs text-muted-foreground truncate">{site.address}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {ncResults && ncResults.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                    {t('nav.nonConformities')}
                  </div>
                  {ncResults.map((nc) => (
                    <button
                      key={nc.id}
                      onClick={() => handleSelect('/app/nonconformities')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{nc.title}</p>
                        <p className="text-xs text-muted-foreground">{nc.severity} · {nc.status}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
