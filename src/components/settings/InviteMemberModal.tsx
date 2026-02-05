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
import { Copy, Check, Building2 } from 'lucide-react';

interface Site {
  id: string;
  name: string;
}

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  onInviteSent: () => void;
}

const roles = ['admin', 'manager', 'inspector', 'contributor', 'viewer'] as const;

export function InviteMemberModal({ open, onOpenChange, orgId, onInviteSent }: InviteMemberModalProps) {
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

  useEffect(() => {
    if (open && orgId) {
      fetchSites();
      // Reset form
      setEmail('');
      setSelectedRole('viewer');
      setSelectedSites([]);
      setInviteLink(null);
      setCopied(false);
    }
  }, [open, orgId]);

  const fetchSites = async () => {
    if (!orgId) return;
    
    const { data } = await supabase
      .from('sites')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name');
    
    setSites(data || []);
  };

  const handleSubmit = async () => {
    if (!email || !orgId || !user) return;
    
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
                  {roles.map((role) => (
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

            {/* Sites (only for non-admin roles) */}
            {selectedRole !== 'admin' && sites.length > 0 && (
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
                disabled={!email || loading}
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
