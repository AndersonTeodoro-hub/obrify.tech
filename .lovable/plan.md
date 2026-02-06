
# Plano: Internacionalizar a Pagina de Auth

## Resumo
Substituir todos os textos hardcoded em `Auth.tsx` por chaves `t()` do i18next e adicionar as traducoes em falta nos 4 ficheiros de idioma (PT, EN, ES, FR). O `LanguageSwitcher` ja esta presente na pagina (linha 82) -- o problema e que os textos nao reagem a mudanca de idioma porque estao hardcoded.

---

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| src/pages/Auth.tsx | Adicionar `useTranslation`, substituir ~30 textos hardcoded por `t()` |
| src/i18n/locales/pt.json | Adicionar novas chaves em `auth.landing` |
| src/i18n/locales/en.json | Adicionar novas chaves em `auth.landing` |
| src/i18n/locales/es.json | Adicionar novas chaves em `auth.landing` |
| src/i18n/locales/fr.json | Adicionar novas chaves em `auth.landing` |

---

## 1. Auth.tsx - Alteracoes

Adicionar `import { useTranslation } from 'react-i18next';` e `const { t } = useTranslation();`

### Mapeamento de textos hardcoded para chaves i18n:

| Texto Hardcoded | Chave i18n |
|-----------------|------------|
| "Plataforma Operacional" | `auth.landing.badge` |
| "Fiscalizacao com" | `auth.landing.mobileTitle` |
| "IA" | `auth.landing.mobileIA` |
| "Detecte defeitos, digitalize inspeccoes, gere relatorios." | `auth.landing.mobileSubtitle` |
| "Bem-vindo" | `auth.welcomeBack` |
| "Entre na sua conta para continuar" | `auth.enterCredentials` |
| "Email" | `auth.email` |
| "seu@email.com" | `auth.emailPlaceholder` |
| "Password" | `auth.password` |
| "Lembrar-me" | `auth.landing.rememberMe` |
| "Esqueceu password?" | `auth.landing.forgotPassword` |
| "Entrar" | `auth.login` |
| "ou" | `common.or` |
| "Ainda nao tem conta?" | `auth.landing.noAccount` |
| "Criar conta gratuita" | `auth.landing.createFreeAccount` |
| "Criar conta" | `auth.createAccount` |
| "Preencha os dados para comecar a usar o Obrify" | `auth.fillDataToStart` |
| "Nome completo" | `auth.fullName` |
| "O seu nome" | `auth.fullNamePlaceholder` |
| "Confirmar password" | `auth.confirmPassword` |
| "Criar Conta" (botao) | `auth.signup` |
| "Ja tem conta?" | `auth.landing.hasAccount` |
| "Entrar" (link) | `auth.login` |
| "Fiscalizacao de obras com" | `auth.landing.heroTitle` |
| "Inteligencia Artificial" | `auth.landing.heroHighlight` |
| "Detecte defeitos automaticamente..." | `auth.landing.heroSubtitle` |
| "Visao por IA" | `auth.landing.featureAI` |
| "Checklists Digitais" | `auth.landing.featureChecklists` |
| "Relatorios PDF" | `auth.landing.featureReports` |
| "Captura por Drone" | `auth.landing.featureDrone` |
| "3x" / "Mais produtividade" | `auth.landing.stat1Value` / `auth.landing.stat1Label` |
| "94%" / "Menos papel" | `auth.landing.stat2Value` / `auth.landing.stat2Label` |
| "IA" / "Deteccao automatica" | `auth.landing.stat3Value` / `auth.landing.stat3Label` |
| Toast texts | Reutilizar chaves `auth.loginError`, `auth.loginSuccess`, etc. ja existentes |

### Pills array refatorizado:
```tsx
const pills = [
  { icon: "eye-icon", label: t('auth.landing.featureAI') },
  { icon: "check", label: t('auth.landing.featureChecklists') },
  { icon: "doc", label: t('auth.landing.featureReports') },
  { icon: "drone", label: t('auth.landing.featureDrone') },
];
```

### Toasts tambem internacionalizados:
```tsx
toast({ title: t('auth.loginError'), description: error.message, variant: "destructive" });
toast({ title: t('auth.loginSuccess'), description: t('auth.loginSuccessDesc') });
```

---

## 2. Novas Chaves de Traducao

### PT (pt.json) - dentro de `auth`:
```json
"landing": {
  "badge": "Plataforma Operacional",
  "mobileTitle": "Fiscalizacao com",
  "mobileSubtitle": "Detecte defeitos, digitalize inspeccoes, gere relatorios.",
  "rememberMe": "Lembrar-me",
  "forgotPassword": "Esqueceu password?",
  "noAccount": "Ainda nao tem conta?",
  "createFreeAccount": "Criar conta gratuita",
  "hasAccount": "Ja tem conta?",
  "heroTitle": "Fiscalizacao de obras com",
  "heroHighlight": "Inteligencia Artificial",
  "heroSubtitle": "Detecte defeitos automaticamente, digitalize inspeccoes e gere relatorios profissionais.",
  "featureAI": "Visao por IA",
  "featureChecklists": "Checklists Digitais",
  "featureReports": "Relatorios PDF",
  "featureDrone": "Captura por Drone",
  "stat1Label": "Mais produtividade",
  "stat2Label": "Menos papel",
  "stat3Label": "Deteccao automatica"
}
```

### EN (en.json):
```json
"landing": {
  "badge": "Operational Platform",
  "mobileTitle": "Inspection with",
  "mobileSubtitle": "Detect defects, digitize inspections, generate reports.",
  "rememberMe": "Remember me",
  "forgotPassword": "Forgot password?",
  "noAccount": "Don't have an account?",
  "createFreeAccount": "Create free account",
  "hasAccount": "Already have an account?",
  "heroTitle": "Construction inspection with",
  "heroHighlight": "Artificial Intelligence",
  "heroSubtitle": "Automatically detect defects, digitize inspections and generate professional reports.",
  "featureAI": "AI Vision",
  "featureChecklists": "Digital Checklists",
  "featureReports": "PDF Reports",
  "featureDrone": "Drone Capture",
  "stat1Label": "More productivity",
  "stat2Label": "Less paper",
  "stat3Label": "Automatic detection"
}
```

### ES (es.json):
```json
"landing": {
  "badge": "Plataforma Operacional",
  "mobileTitle": "Inspeccion con",
  "mobileSubtitle": "Detecte defectos, digitalice inspecciones, genere informes.",
  "rememberMe": "Recordarme",
  "forgotPassword": "Olvido su contrasena?",
  "noAccount": "No tiene cuenta?",
  "createFreeAccount": "Crear cuenta gratuita",
  "hasAccount": "Ya tiene cuenta?",
  "heroTitle": "Inspeccion de obras con",
  "heroHighlight": "Inteligencia Artificial",
  "heroSubtitle": "Detecte defectos automaticamente, digitalice inspecciones y genere informes profesionales.",
  "featureAI": "Vision por IA",
  "featureChecklists": "Checklists Digitales",
  "featureReports": "Informes PDF",
  "featureDrone": "Captura por Drone",
  "stat1Label": "Mas productividad",
  "stat2Label": "Menos papel",
  "stat3Label": "Deteccion automatica"
}
```

### FR (fr.json):
```json
"landing": {
  "badge": "Plateforme Operationnelle",
  "mobileTitle": "Inspection avec",
  "mobileSubtitle": "Detectez les defauts, numerisez les inspections, generez des rapports.",
  "rememberMe": "Se souvenir de moi",
  "forgotPassword": "Mot de passe oublie ?",
  "noAccount": "Pas encore de compte ?",
  "createFreeAccount": "Creer un compte gratuit",
  "hasAccount": "Vous avez deja un compte ?",
  "heroTitle": "Inspection de chantiers avec",
  "heroHighlight": "Intelligence Artificielle",
  "heroSubtitle": "Detectez automatiquement les defauts, numerisez les inspections et generez des rapports professionnels.",
  "featureAI": "Vision par IA",
  "featureChecklists": "Checklists Numeriques",
  "featureReports": "Rapports PDF",
  "featureDrone": "Capture par Drone",
  "stat1Label": "Plus de productivite",
  "stat2Label": "Moins de papier",
  "stat3Label": "Detection automatique"
}
```

---

## Ordem de Implementacao

1. Adicionar chaves `auth.landing.*` aos 4 ficheiros de traducao (pt, en, es, fr)
2. Modificar `Auth.tsx`: adicionar `useTranslation`, substituir todos os textos hardcoded por `t()`
