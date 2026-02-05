import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Building2, Check, X, Mail, LogIn, UserPlus } from 'lucide-react';

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  org_id: string;
  organization: {
    name: string;
  } | null;
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-500/10 text-red-500 border-red-500/20',
  manager: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  inspector: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  contributor: 'bg-green-500/10 text-green-500 border-green-500/20',
  viewer: 'bg-muted text-muted-foreground border-border',
};

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, signIn, signUp } = useAuth();
  const { toast } = useToast();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Auth form state
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchInvitation();
    }
  }, [token]);

  useEffect(() => {
    // Pre-fill email from invitation
    if (invitation) {
      setEmail(invitation.email);
    }
  }, [invitation]);

  const fetchInvitation = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('invitations')
        .select(`
          id,
          email,
          role,
          status,
          expires_at,
          org_id,
          organizations:org_id(name)
        `)
        .eq('token', token)
        .single();

      if (fetchError || !data) {
        setError('invite.invalidToken');
        return;
      }

      // Check if already accepted
      if (data.status !== 'pending') {
        setError('invite.alreadyUsed');
        return;
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        // Mark as expired
        await supabase
          .from('invitations')
          .update({ status: 'expired' })
          .eq('id', data.id);
        setError('invite.expired');
        return;
      }

      setInvitation({
        ...data,
        organization: Array.isArray(data.organizations) 
          ? data.organizations[0] 
          : data.organizations
      });
    } catch (err) {
      console.error('Error fetching invitation:', err);
      setError('invite.invalidToken');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          toast({
            title: t('common.error'),
            description: error.message,
            variant: 'destructive',
          });
          return;
        }
        toast({
          title: t('auth.checkEmail'),
          description: t('auth.confirmationSent'),
        });
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: t('common.error'),
            description: error.message,
            variant: 'destructive',
          });
          return;
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const acceptInvitation = async () => {
    if (!user || !invitation) return;

    setAccepting(true);
    try {
      // Check if user is already a member
      const { data: existingMembership } = await supabase
        .from('memberships')
        .select('id')
        .eq('org_id', invitation.org_id)
        .eq('user_id', user.id)
        .single();

      if (existingMembership) {
        toast({
          title: t('invite.alreadyMember'),
          description: t('invite.alreadyMemberDesc'),
        });
        navigate('/app');
        return;
      }

      // Create membership
      const { error: membershipError } = await supabase
        .from('memberships')
        .insert({
          org_id: invitation.org_id,
          user_id: user.id,
          role: invitation.role as any,
        });

      if (membershipError) {
        throw membershipError;
      }

      // Mark invitation as accepted
      await supabase
        .from('invitations')
        .update({ 
          status: 'accepted', 
          accepted_at: new Date().toISOString() 
        })
        .eq('id', invitation.id);

      toast({
        title: t('invite.accepted'),
        description: t('invite.welcomeToOrg', { org: invitation.organization?.name }),
      });

      navigate('/app');
    } catch (err) {
      console.error('Error accepting invitation:', err);
      toast({
        title: t('common.error'),
        description: t('common.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <X className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>{t('invite.invalidTitle')}</CardTitle>
            <CardDescription>{t(error)}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <Link to="/auth">{t('auth.signIn')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t('invite.title')}</CardTitle>
          <CardDescription>
            {t('invite.joinOrg', { org: invitation?.organization?.name })}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('invite.organization')}</span>
              <span className="font-medium">{invitation?.organization?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('team.role')}</span>
              <Badge variant="outline" className={roleColors[invitation?.role || 'viewer']}>
                {t(`team.roles.${invitation?.role}`)}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('team.email')}</span>
              <span className="text-sm">{invitation?.email}</span>
            </div>
          </div>

          {user ? (
            // User is logged in - show accept button
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div className="text-sm">
                  <p className="text-muted-foreground">{t('invite.loggedInAs')}</p>
                  <p className="font-medium">{user.email}</p>
                </div>
              </div>
              <Button 
                className="w-full" 
                onClick={acceptInvitation}
                disabled={accepting}
              >
                {accepting ? (
                  t('common.loading')
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {t('invite.accept')}
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate('/auth')}
              >
                {t('invite.useOtherAccount')}
              </Button>
            </div>
          ) : (
            // User not logged in - show auth form
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="flex gap-2 p-1 bg-muted rounded-lg">
                <Button
                  type="button"
                  variant={!isSignUp ? 'default' : 'ghost'}
                  className="flex-1"
                  onClick={() => setIsSignUp(false)}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  {t('auth.signIn')}
                </Button>
                <Button
                  type="button"
                  variant={isSignUp ? 'default' : 'ghost'}
                  className="flex-1"
                  onClick={() => setIsSignUp(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t('auth.signUp')}
                </Button>
              </div>

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t('auth.name')}</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('auth.namePlaceholder')}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={authLoading}
              >
                {authLoading ? t('common.loading') : (isSignUp ? t('auth.signUp') : t('auth.signIn'))}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
