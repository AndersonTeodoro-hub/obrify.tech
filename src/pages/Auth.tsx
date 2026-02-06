import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Activity, Loader2, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Checkbox } from "@/components/ui/checkbox";

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

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) {
      toast({ title: t("auth.loginError"), description: error.message, variant: "destructive" });
    } else {
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800 flex items-center justify-center shadow-lg">
                <Activity className="w-5 h-5 text-white" />
              </div>
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
                      <Checkbox id="remember" />
                      <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">{t("auth.landing.rememberMe")}</label>
                    </div>
                    <button type="button" className="text-sm text-primary hover:underline">{t("auth.landing.forgotPassword")}</button>
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
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  <span className="text-xs text-muted-foreground">{t("common.or")}</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
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
                    <input
                      id="signup-name"
                      type="text"
                      placeholder={t("auth.fullNamePlaceholder")}
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="signup-email" className="text-sm font-medium text-foreground">{t("auth.email")}</label>
                    <input
                      id="signup-email"
                      type="email"
                      placeholder={t("auth.emailPlaceholder")}
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="signup-password" className="text-sm font-medium text-foreground">{t("auth.password")}</label>
                    <input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="signup-confirm" className="text-sm font-medium text-foreground">{t("auth.confirmPassword")}</label>
                    <input
                      id="signup-confirm"
                      type="password"
                      placeholder="••••••••"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      required
                      className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 text-white font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("auth.signup")}
                  </button>
                </form>
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  <span className="text-xs text-muted-foreground">{t("common.or")}</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
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
          {/* Top - Badge */}
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-white/90 font-medium">{t("auth.landing.badge")}</span>
            </div>
          </div>

          {/* Center */}
          <div className="space-y-6 animate-fade-in" style={{ animationDelay: "100ms" }}>
            <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
              {t("auth.landing.heroTitle")}{" "}
              <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                {t("auth.landing.heroHighlight")}
              </span>
            </h2>
            <p className="text-lg text-slate-300 max-w-lg">
              {t("auth.landing.heroSubtitle")}
            </p>
            <div className="flex flex-wrap gap-2" style={{ animationDelay: "200ms" }}>
              {pills.map((pill) => (
                <span key={pill.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-sm text-white border border-white/5">
                  <span className="text-amber-500">{pill.icon}</span>
                  {pill.label}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom - Stats */}
          <div className="flex items-center gap-8 animate-fade-in" style={{ animationDelay: "300ms" }}>
            <div>
              <p className="text-3xl font-bold text-white">3x</p>
              <p className="text-sm text-slate-400">{t("auth.landing.stat1Label")}</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div>
              <p className="text-3xl font-bold text-white">94%</p>
              <p className="text-sm text-slate-400">{t("auth.landing.stat2Label")}</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div>
              <p className="text-3xl font-bold text-white">IA</p>
              <p className="text-sm text-slate-400">{t("auth.landing.stat3Label")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
