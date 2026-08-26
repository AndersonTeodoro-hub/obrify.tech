import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Building2, AlertTriangle } from 'lucide-react';
import { requiresOrgWideConfirmation } from './invite-scope';

interface Site {
  id: string;
  name: string;
}

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  onInviteSent: () => void;
  /** Quando definido, o convite fica pré-scoped a esta obra (site_ids bloqueado). */
  lockedSite?: { id: string; name: string } | null;
}

const roles = ['admin', 'manager', 'inspector', 'contributor', 'viewer'] as const;

export function InviteMemberModal({ open, onOpenChange, orgId, onInviteSent, lockedSite }: InviteMemberModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('viewer');
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [orgName, setOrgName] = useState<string>('');
  // Confirmação explícita de convite sem obra: sem isto, o envio fica bloqueado.
  const [orgWideConfirmed, setOrgWideConfirmed] = useState(false);

  // Pré-scoped a uma obra → 'admin' é incoerente (admin = org inteira, site_ids: []).
  // Removê-lo evita que o branch admin no submit apague o scope silenciosamente.
  const availableRoles = lockedSite ? roles.filter((r) => r !== 'admin') : roles;

  const isAdminRole = selectedRole === 'admin';
  const needsOrgWideConfirm = requiresOrgWideConfirmation({
    role: selectedRole,
    lockedSiteId: lockedSite?.id ?? null,
    selectedSites,
  });

  useEffect(() => {
    if (open && orgId) {
      if (!lockedSite) fetchSites();
      fetchOrgName();
      // Reset form
      setEmail('');
      setSelectedRole('viewer');
      setSelectedSites(lockedSite ? [lockedSite.id] : []);
      setInviteLink(null);
      setCopied(false);
      setOrgWideConfirmed(false);
    }
  }, [open, orgId, lockedSite?.id]);

  // O nome da organização é o dado que faltava para perceber o alcance do convite
  // (um convite pode sair para a org errada, que nem obras tem).
  const fetchOrgName = async () => {
    if (!orgId) return;

    const { data, error } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    if (error) {
      console.error('Erro a ler o nome da organização:', error);
      setOrgName('');
      return;
    }

    setOrgName(data?.name ?? '');
  };

  const fetchSites = async () => {
    if (!orgId) return;

    const { data, error } = await supabase
      .from('sites')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name');

    if (error) {
      console.error('Erro a listar obras da organização:', error);
      toast({
        title: t('common.error'),
        description: t('team.sitesLoadFailed', 'Não foi possível listar as obras desta organização.'),
        variant: 'destructive',
      });
      setSites([]);
      return;
    }

    setSites(data || []);
  };

  const handleSubmit = async () => {
    if (!email || !orgId || !user) return;

    // Guarda ruidosa: nunca criar um convite sem obra por distracção.
    if (needsOrgWideConfirm && !orgWideConfirmed) {
      toast({
        title: t('team.orgWideNotConfirmedTitle', 'Convite sem obra'),
        description: t(
          'team.orgWideNotConfirmed',
          'Escolha pelo menos uma obra, ou confirme que o convite dá acesso a toda a organização.',
        ),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          org_id: orgId,
          email: email.toLowerCase().trim(),
          role: selectedRole,
          site_ids: selectedRole === 'admin' ? [] : selectedSites,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Duplicate invitation
          toast({
            title: t('common.error'),
            description: t('team.inviteExists'),
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return;
      }

      const link = `${window.location.origin}/invite/${data.token}`;
      setInviteLink(link);
      
      toast({
        title: t('team.inviteSent'),
        description: email,
      });
    } catch (error) {
      console.error('Error creating invitation:', error);
      toast({
        title: t('common.error'),
        description: t('common.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    if (inviteLink) {
      onInviteSent();
    }
    onOpenChange(false);
  };

  const toggleSite = (siteId: string) => {
    setSelectedSites(prev => 
      prev.includes(siteId)
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('team.inviteMember')}</DialogTitle>
          <DialogDescription>{t('team.subtitle')}</DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          // Success state - show link
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
              <Check className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium">{t('team.inviteSent')}</span>
            </div>
            
            <div className="space-y-2">
              <Label>{t('team.inviteLink')}</Label>
              <div className="flex gap-2">
                <Input 
                  value={inviteLink} 
                  readOnly 
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyLink}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('team.linkExpires')}
              </p>
            </div>
          </div>
        ) : (
          // Form state
          <div className="space-y-4 py-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">{t('team.email')} *</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>{t('team.role')} *</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex flex-col">
                        <span>{t(`team.roles.${role}`)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t(`team.roleDescriptions.${role}`)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Obra bloqueada (pré-scoped) vs. seletor multi-obra (TeamTab) */}
            {lockedSite ? (
              <div className="space-y-2">
                <Label>{t('team.sites')}</Label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{lockedSite.name}</span>
                </div>
              </div>
            ) : selectedRole !== 'admin' && sites.length > 0 ? (
              <div className="space-y-2">
                <Label>{t('team.sites')}</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {selectedSites.length === 0
                    ? t('team.allSites')
                    : `${selectedSites.length} ${t('team.selectSites')}`}
                </p>
                <ScrollArea className="h-[150px] rounded-md border p-2">
                  <div className="space-y-2">
                    {sites.map((site) => (
                      <div
                        key={site.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleSite(site.id)}
                      >
                        <Checkbox
                          checked={selectedSites.includes(site.id)}
                          onCheckedChange={() => toggleSite(site.id)}
                        />
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{site.name}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

            {/* Org sem obras: antes era `null` — o convite saía org-wide sem que
                nada o dissesse. Passa a ser explícito. */}
            {!lockedSite && !isAdminRole && sites.length === 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  {t(
                    'team.noSitesInOrg',
                    'Esta organização não tem nenhuma obra. O convite dará acesso à organização, mas não a qualquer obra. Confirme que está na organização certa.',
                  )}
                </p>
              </div>
            )}

            {/* Resumo do alcance — sempre visível, com o nome da organização. */}
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <p className="font-medium">{t('team.scopeSummaryTitle', 'Este convite dá acesso a:')}</p>
              {lockedSite ? (
                <p className="mt-1 text-muted-foreground">
                  {t('team.scopeSite', 'Apenas à obra')} <strong>{lockedSite.name}</strong>
                  {orgName ? ` (${orgName})` : ''}
                </p>
              ) : isAdminRole ? (
                <p className="mt-1 text-muted-foreground">
                  {t('team.scopeAdmin', 'Toda a organização')} <strong>{orgName || '—'}</strong>
                  {' — '}
                  {t('team.scopeAdminNote', 'administrador é sempre ao nível da organização.')}
                </p>
              ) : selectedSites.length > 0 ? (
                <p className="mt-1 text-muted-foreground">
                  {selectedSites.length} {t('team.scopeSites', 'obra(s) de')}{' '}
                  <strong>{orgName || '—'}</strong>
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  {t('team.scopeOrgWide', 'Toda a organização')} <strong>{orgName || '—'}</strong>
                  {sites.length === 0 ? ` — ${t('team.scopeNoSites', 'que não tem obras')}` : ''}
                </p>
              )}
            </div>

            {/* Sem obra escolhida: exigir confirmação explícita antes de enviar. */}
            {needsOrgWideConfirm && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                <Checkbox
                  checked={orgWideConfirmed}
                  onCheckedChange={(v) => setOrgWideConfirmed(v === true)}
                />
                <span className="text-xs">
                  {t(
                    'team.orgWideConfirm',
                    'Confirmo que este convite não é para uma obra específica e dá acesso a toda a organização.',
                  )}
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          {inviteLink ? (
            <Button onClick={handleClose}>
              {t('common.close')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!email || loading || (needsOrgWideConfirm && !orgWideConfirmed)}
              >
                {loading ? t('common.loading') : t('team.inviteMember')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
