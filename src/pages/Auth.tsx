import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Remember me: load saved email
  useEffect(() => {
    const savedEmail = localStorage.getItem('obrify_remember_email');
    if (savedEmail) {
      setLoginEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) {
      toast({ title: t("auth.loginError"), description: error.message, variant: "destructive" });
    } else {
      // Remember me
      if (rememberMe) {
        localStorage.setItem('obrify_remember_email', loginEmail);
      } else {
        localStorage.removeItem('obrify_remember_email');
      }
      toast({ title: t("auth.loginSuccess"), description: t("auth.loginSuccessDesc") });
      navigate("/app");
    }
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== signupConfirmPassword) {
      toast({ title: t("common.error"), description: t("auth.passwordMismatch"), variant: "destructive" });
      return;
    }
    if (signupPassword.length < 6) {
      toast({ title: t("common.error"), description: t("auth.passwordTooShort"), variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    if (error) {
      toast({ title: t("auth.signupError"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("auth.signupSuccess"), description: t("auth.signupSuccessDesc") });
      navigate("/app");
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("common.success"), description: t("auth.forgotPassword.success") });
      setShowForgotPassword(false);
      setForgotEmail("");
    }
    setForgotLoading(false);
  };

  const pills = [
    { icon: "👁", label: t("auth.landing.featureAI") },
    { icon: "✓", label: t("auth.landing.featureChecklists") },
    { icon: "📄", label: t("auth.landing.featureReports") },
    { icon: "🚁", label: t("auth.landing.featureDrone") },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Mobile Hero */}
      <div className="lg:hidden relative h-[45vh] overflow-hidden">
        <img src="/images/hero-drone.jpeg" alt="Drone" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-900/90" />
        <div className="relative z-10 flex flex-col justify-center items-center h-full px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 mb-4 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/90 font-medium">{t("auth.landing.badge")}</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 animate-fade-in">
            {t("auth.landing.mobileTitle")}{" "}
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              {t("auth.landing.heroHighlight")}
            </span>
          </h2>
          <p className="text-sm text-slate-300 max-w-xs animate-fade-in">
            {t("auth.landing.mobileSubtitle")}
          </p>
        </div>
      </div>

      {/* Left - Form */}
      <div className="flex-1 lg:w-[40%] lg:max-w-none flex flex-col bg-white dark:bg-slate-950 relative">
        <div className="absolute top-4 right-4 flex gap-1 z-10">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10 lg:px-12">
          <div className="w-full max-w-[400px]">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-10">
              <img src="/images/obrify-logo.jpeg" alt="Obrify" className="w-10 h-10 rounded-xl shadow-lg object-cover" />
              <span className="text-xl font-bold text-foreground">Obrify</span>
            </div>

            {isLogin ? (
              <>
                <h1 className="text-2xl font-bold text-foreground mb-1">{t("auth.welcomeBack")}</h1>
                <p className="text-sm text-muted-foreground mb-8">{t("auth.enterCredentials")}</p>
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-1.5">
                    <label htmlFor="login-email" className="text-sm font-medium text-foreground">{t("auth.email")}</label>
                    <input
                      id="login-email"
                      type="email"
                      placeholder={t("auth.emailPlaceholder")}
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="login-password" className="text-sm font-medium text-foreground">{t("auth.password")}</label>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                      />
                      <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">{t("auth.landing.rememberMe")}</label>
                    </div>
                    <button type="button" onClick={() => setShowForgotPassword(true)} className="text-sm text-primary hover:underline">{t("auth.landing.forgotPassword")}</button>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 text-white font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("auth.login")}
                  </button>
                </form>

                {/* Google OAuth */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  <span className="text-xs text-muted-foreground">{t("common.or")}</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const { error } = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: window.location.origin,
                    });
                    if (error) {
                      toast({ title: t("auth.socialLoginError"), description: error.message, variant: "destructive" });
                    }
                  }}
                  className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-foreground font-medium flex items-center justify-center gap-3 hover:shadow-md transition-all duration-200"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                    <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  {t("auth.continueWithGoogle")}
                </button>

                <p className="text-center text-sm text-muted-foreground mt-4">
                  {t("auth.landing.noAccount")}{" "}
                  <button onClick={() => setIsLogin(false)} className="text-primary font-medium hover:underline">
                    {t("auth.landing.createFreeAccount")}
                  </button>
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-foreground mb-1">{t("auth.createAccount")}</h1>
                <p className="text-sm text-muted-foreground mb-8">{t("auth.fillDataToStart")}</p>
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="signup-name" className="text-sm font-medium text-foreground">{t("auth.fullName")}</label>
                    <input id="signup-name" type="text" placeholder={t("auth.fullNamePlaceholder")} value={signupName} onChange={(e) => setSignupName(e.target.value)} required className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="signup-email" className="text-sm font-medium text-foreground">{t("auth.email")}</label>
                    <input id="signup-email" type="email" placeholder={t("auth.emailPlaceholder")} value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="signup-password" className="text-sm font-medium text-foreground">{t("auth.password")}</label>
                    <input id="signup-password" type="password" placeholder="••••••••" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="signup-confirm" className="text-sm font-medium text-foreground">{t("auth.confirmPassword")}</label>
                    <input id="signup-confirm" type="password" placeholder="••••••••" value={signupConfirmPassword} onChange={(e) => setSignupConfirmPassword(e.target.value)} required className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  </div>
                  <button type="submit" disabled={isLoading} className="w-full h-11 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 text-white font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("auth.signup")}
                  </button>
                </form>

                {/* Google OAuth */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  <span className="text-xs text-muted-foreground">{t("common.or")}</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const { error } = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: window.location.origin,
                    });
                    if (error) {
                      toast({ title: t("auth.socialLoginError"), description: error.message, variant: "destructive" });
                    }
                  }}
                  className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-foreground font-medium flex items-center justify-center gap-3 hover:shadow-md transition-all duration-200"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                    <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  {t("auth.continueWithGoogle")}
                </button>

                <p className="text-center text-sm text-muted-foreground mt-4">
                  {t("auth.landing.hasAccount")}{" "}
                  <button onClick={() => setIsLogin(true)} className="text-primary font-medium hover:underline">
                    {t("auth.login")}
                  </button>
                </p>
              </>
            )}

            <p className="text-center text-xs text-muted-foreground mt-8">© 2026 Obrify</p>
          </div>
        </div>
      </div>

      {/* Right - Hero (desktop only) */}
      <div className="hidden lg:block lg:w-[60%] relative overflow-hidden">
        <img src="/images/hero-drone.jpeg" alt="Drone" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-900/80" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-60" />

        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-white/90 font-medium">{t("auth.landing.badge")}</span>
            </div>
          </div>

          <div className="space-y-6 animate-fade-in" style={{ animationDelay: "100ms" }}>
            <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
              {t("auth.landing.heroTitle")}{" "}
              <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                {t("auth.landing.heroHighlight")}
              </span>
            </h2>
            <p className="text-lg text-slate-300 max-w-lg">{t("auth.landing.heroSubtitle")}</p>
            <div className="flex flex-wrap gap-2" style={{ animationDelay: "200ms" }}>
              {pills.map((pill) => (
                <span key={pill.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-sm text-white border border-white/5">
                  <span className="text-amber-500">{pill.icon}</span>
                  {pill.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-8 animate-fade-in" style={{ animationDelay: "300ms" }}>
            <div><p className="text-3xl font-bold text-white">3x</p><p className="text-sm text-slate-400">{t("auth.landing.stat1Label")}</p></div>
            <div className="w-px h-10 bg-white/20" />
            <div><p className="text-3xl font-bold text-white">94%</p><p className="text-sm text-slate-400">{t("auth.landing.stat2Label")}</p></div>
            <div className="w-px h-10 bg-white/20" />
            <div><p className="text-3xl font-bold text-white">IA</p><p className="text-sm text-slate-400">{t("auth.landing.stat3Label")}</p></div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("auth.forgotPassword.title")}</DialogTitle>
            <DialogDescription>{t("auth.forgotPassword.description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword}>
            <div className="py-4">
              <Label htmlFor="forgot-email">{t("auth.email")}</Label>
              <Input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                required
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForgotPassword(false)}>
                {t("auth.forgotPassword.backToLogin")}
              </Button>
              <Button type="submit" disabled={forgotLoading || !forgotEmail.trim()}>
                {forgotLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {t("auth.forgotPassword.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
