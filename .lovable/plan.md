
# Plano: Sistema de Onboarding/Tutor Interactivo Premium

## Resumo
Implementar um sistema completo de onboarding com botao de ajuda flutuante, modal de boas-vindas, tour guiado interactivo usando driver.js, e menu de ajuda expandido.

---

## Ficheiros a Criar

| Ficheiro | Descricao |
|----------|-----------|
| src/components/onboarding/HelpButton.tsx | Botao flutuante de ajuda global |
| src/components/onboarding/WelcomeModal.tsx | Modal de boas-vindas primeira visita |
| src/components/onboarding/ProductTour.tsx | Configuracao e funcao do tour guiado |
| src/components/onboarding/HelpMenu.tsx | Menu dropdown com opcoes de ajuda |
| src/components/onboarding/KeyboardShortcutsModal.tsx | Modal de atalhos de teclado |

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| package.json | Adicionar driver.js |
| src/index.css | Estilos do tour e animacoes pulse-glow |
| src/components/layout/AppLayout.tsx | Integrar HelpButton, WelcomeModal |
| src/components/layout/AppSidebar.tsx | Adicionar data-tour attributes |
| src/pages/app/Dashboard.tsx | Adicionar data-tour="dashboard-stats" |
| src/i18n/locales/pt.json | Traducoes de onboarding |
| src/i18n/locales/en.json | Traducoes de onboarding |

---

## 1. Dependencia: driver.js

Adicionar ao package.json:
```json
"driver.js": "^1.3.1"
```

---

## 2. CSS Global (src/index.css)

### Animacao pulse-glow para o botao:
```css
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(212, 130, 74, 0.4);
  }
  50% {
    box-shadow: 0 0 0 12px rgba(212, 130, 74, 0);
  }
}

.help-button-pulse {
  animation: pulse-glow 2s ease-in-out infinite;
}
```

### Estilos do tour popover:
```css
/* Tour Popover Styling */
.sitepulse-tour-popover {
  background: white !important;
  border-radius: 16px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
}

.dark .sitepulse-tour-popover {
  background: #1e293b !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
}

/* Titulo, descricao, botoes customizados */
```

---

## 3. HelpButton.tsx

### Componente do botao flutuante:
```tsx
interface HelpButtonProps {
  onOpenWelcome: () => void;
  showPulse: boolean;
}

export function HelpButton({ onOpenWelcome, showPulse }: HelpButtonProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  return (
    <>
      <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <PopoverTrigger asChild>
          <button
            data-tour="help-button"
            className={cn(
              "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full",
              "bg-gradient-to-br from-accent-500 to-accent-600",
              "shadow-lg hover:shadow-xl hover:scale-105",
              "transition-all duration-200",
              "flex items-center justify-center",
              showPulse && "help-button-pulse"
            )}
          >
            <Sparkles className="w-6 h-6 text-white" />
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <HelpMenu onStartTour={...} onOpenWelcome={...} />
        </PopoverContent>
      </Popover>
      
      <Tooltip>
        <TooltipTrigger>...</TooltipTrigger>
        <TooltipContent>Descobrir SitePulse</TooltipContent>
      </Tooltip>
    </>
  );
}
```

### Especificacoes visuais:
- Posicao: fixed bottom-6 right-6
- Tamanho: 56px (w-14 h-14)
- Gradiente: from-accent-500 to-accent-600
- Icone: Sparkles branco
- Shadow-lg com glow subtil
- Hover: scale(1.05), shadow mais intenso
- Z-index: 50

---

## 4. WelcomeModal.tsx

### Modal de boas-vindas:
```tsx
interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTour: () => void;
  onExplore: () => void;
}

export function WelcomeModal({ open, onOpenChange, onStartTour, onExplore }: WelcomeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg text-center">
        {/* Logo animado */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 
                        flex items-center justify-center shadow-lg animate-fade-in-up">
          <span className="text-white font-bold text-3xl">S</span>
        </div>
        
        <DialogTitle className="text-2xl font-bold">
          Bem-vindo ao SitePulse
        </DialogTitle>
        
        <DialogDescription>
          A plataforma inteligente de fiscalizacao de obras
        </DialogDescription>
        
        {/* Stats impressionantes */}
        <div className="grid grid-cols-3 gap-4 py-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-accent-600">94%</p>
            <p className="text-xs text-muted-foreground">Menos tempo em relatorios</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-accent-600">3x</p>
            <p className="text-xs text-muted-foreground">Mais obras por fiscalizador</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-accent-600">IA</p>
            <p className="text-xs text-muted-foreground">Deteccao automatica</p>
          </div>
        </div>
        
        {/* Botoes */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onExplore}>
            Explorar sozinho
          </Button>
          <Button variant="accent" className="flex-1" onClick={onStartTour}>
            <Play className="w-4 h-4 mr-2" />
            Iniciar Tour Guiado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5. ProductTour.tsx

### Configuracao do tour com driver.js:
```tsx
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const tourSteps = [
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: 'Navegacao Principal',
      description: 'Aqui encontra todas as seccoes da plataforma: obras, capturas, inspeccoes, nao-conformidades e relatorios.',
      side: 'right',
      align: 'start'
    }
  },
  {
    element: '[data-tour="dashboard-stats"]',
    popover: {
      title: 'Visao Geral',
      description: 'O dashboard mostra as metricas mais importantes: obras activas, capturas, NCs abertas e taxa de conformidade.',
      side: 'bottom'
    }
  },
  {
    element: '[data-tour="sites"]',
    popover: {
      title: 'Gestao de Obras',
      description: 'Crie e organize as suas obras com hierarquia completa: Pisos -> Areas -> Pontos de Captura.',
      side: 'right'
    }
  },
  {
    element: '[data-tour="captures"]',
    popover: {
      title: 'Capturas Inteligentes',
      description: 'Faca upload de fotos, videos e imagens 360. A IA analisa automaticamente e detecta problemas!',
      side: 'right'
    }
  },
  {
    element: '[data-tour="inspections"]',
    popover: {
      title: 'Inspeccoes Digitais',
      description: 'Crie checklists personalizados e execute inspeccoes estruturadas. Tudo fica registado automaticamente.',
      side: 'right'
    }
  },
  {
    element: '[data-tour="nonconformities"]',
    popover: {
      title: 'Nao-Conformidades',
      description: 'Registe problemas com evidencias fotograficas. Acompanhe o estado de resolucao de cada NC.',
      side: 'right'
    }
  },
  {
    element: '[data-tour="reports"]',
    popover: {
      title: 'Relatorios Automaticos',
      description: 'Gere relatorios PDF profissionais com um clique: relatorios de inspeccao, listagem de NCs e mais.',
      side: 'right'
    }
  },
  {
    element: '[data-tour="help-button"]',
    popover: {
      title: 'Sempre Disponivel',
      description: 'Pode reiniciar este tour a qualquer momento clicando neste botao. Boas fiscalizacoes!',
      side: 'left'
    }
  }
];

export function startProductTour(onComplete?: () => void) {
  const driverObj = driver({
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Proximo',
    prevBtnText: 'Anterior',
    doneBtnText: 'Concluir',
    animate: true,
    overlayColor: 'rgba(0, 0, 0, 0.75)',
    stagePadding: 8,
    stageRadius: 12,
    popoverClass: 'sitepulse-tour-popover',
    steps: tourSteps,
    onDestroyed: () => {
      localStorage.setItem('sitepulse_onboarding_completed', 'true');
      onComplete?.();
    }
  });
  
  driverObj.drive();
}
```

---

## 6. HelpMenu.tsx

### Menu dropdown de ajuda:
```tsx
interface HelpMenuProps {
  onStartTour: () => void;
  onOpenKeyboardShortcuts: () => void;
  onClose: () => void;
}

export function HelpMenu({ onStartTour, onOpenKeyboardShortcuts, onClose }: HelpMenuProps) {
  return (
    <div className="w-72">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold">Centro de Ajuda</h3>
        <p className="text-sm text-muted-foreground">Como podemos ajudar?</p>
      </div>
      
      <div className="p-2 space-y-1">
        <button onClick={onStartTour} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <div className="w-10 h-10 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
            <Play className="w-5 h-5 text-accent-600" />
          </div>
          <div className="text-left">
            <p className="font-medium">Tour Guiado</p>
            <p className="text-xs text-muted-foreground">Conheca todas as funcionalidades</p>
          </div>
        </button>
        
        <button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="font-medium">Documentacao</p>
            <p className="text-xs text-muted-foreground">Guias e tutoriais detalhados</p>
          </div>
        </button>
        
        <button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-left">
            <p className="font-medium">Falar com Suporte</p>
            <p className="text-xs text-muted-foreground">Estamos aqui para ajudar</p>
          </div>
        </button>
        
        <button onClick={onOpenKeyboardShortcuts} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Keyboard className="w-5 h-5 text-slate-600" />
          </div>
          <div className="text-left">
            <p className="font-medium">Atalhos de Teclado</p>
            <p className="text-xs text-muted-foreground">Seja mais produtivo</p>
          </div>
        </button>
      </div>
      
      <div className="p-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          Versao 1.0.0 • <a href="#" className="text-accent-600 hover:underline">Notas de versao</a>
        </p>
      </div>
    </div>
  );
}
```

---

## 7. Data Attributes nos Elementos

### AppSidebar.tsx - Adicionar atributos:
```tsx
// Sidebar principal
<Sidebar data-tour="sidebar" ...>

// Nav items individuais
<NavLink data-tour="sites" ...>
<NavLink data-tour="captures" ...>
<NavLink data-tour="inspections" ...>
<NavLink data-tour="nonconformities" ...>
<NavLink data-tour="reports" ...>
```

### Dashboard.tsx - Stats grid:
```tsx
<div data-tour="dashboard-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
```

---

## 8. AppLayout.tsx - Integracao

### Adicionar gestao de estado e componentes:
```tsx
export function AppLayout() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  
  useEffect(() => {
    const completed = localStorage.getItem('sitepulse_onboarding_completed');
    if (!completed) {
      setShowWelcome(true);
      setShowPulse(true);
    }
  }, []);
  
  const handleStartTour = () => {
    setShowWelcome(false);
    setTimeout(() => {
      startProductTour(() => {
        setShowPulse(false);
      });
    }, 300);
  };
  
  const handleExplore = () => {
    setShowWelcome(false);
    localStorage.setItem('sitepulse_onboarding_completed', 'true');
    setShowPulse(false);
  };
  
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-screen">
          <AppHeader />
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      
      {/* Onboarding Components */}
      <HelpButton 
        showPulse={showPulse}
        onOpenWelcome={() => setShowWelcome(true)}
      />
      
      <WelcomeModal
        open={showWelcome}
        onOpenChange={setShowWelcome}
        onStartTour={handleStartTour}
        onExplore={handleExplore}
      />
    </SidebarProvider>
  );
}
```

---

## 9. Traducoes (src/i18n/locales/)

### Adicionar ao pt.json e en.json:
```json
"onboarding": {
  "welcomeTitle": "Bem-vindo ao SitePulse",
  "welcomeDesc": "A plataforma inteligente de fiscalizacao de obras",
  "stat1Value": "94%",
  "stat1Label": "Menos tempo em relatorios",
  "stat2Value": "3x",
  "stat2Label": "Mais obras por fiscalizador",
  "stat3Value": "IA",
  "stat3Label": "Deteccao automatica",
  "exploreAlone": "Explorar sozinho",
  "startTour": "Iniciar Tour Guiado",
  "helpCenter": "Centro de Ajuda",
  "howCanWeHelp": "Como podemos ajudar?",
  "guidedTour": "Tour Guiado",
  "guidedTourDesc": "Conheca todas as funcionalidades",
  "documentation": "Documentacao",
  "documentationDesc": "Guias e tutoriais detalhados",
  "talkToSupport": "Falar com Suporte",
  "talkToSupportDesc": "Estamos aqui para ajudar",
  "keyboardShortcuts": "Atalhos de Teclado",
  "keyboardShortcutsDesc": "Seja mais produtivo",
  "version": "Versao",
  "releaseNotes": "Notas de versao",
  "discoverSitePulse": "Descobrir SitePulse",
  "tour": {
    "sidebar": "Navegacao Principal",
    "sidebarDesc": "Aqui encontra todas as seccoes da plataforma.",
    "stats": "Visao Geral",
    "statsDesc": "O dashboard mostra as metricas mais importantes.",
    "sites": "Gestao de Obras",
    "sitesDesc": "Crie e organize as suas obras com hierarquia completa.",
    "captures": "Capturas Inteligentes",
    "capturesDesc": "Faca upload de fotos, videos e imagens 360.",
    "inspections": "Inspeccoes Digitais",
    "inspectionsDesc": "Crie checklists personalizados e execute inspeccoes.",
    "ncs": "Nao-Conformidades",
    "ncsDesc": "Registe problemas com evidencias fotograficas.",
    "reports": "Relatorios Automaticos",
    "reportsDesc": "Gere relatorios PDF profissionais com um clique.",
    "helpButton": "Sempre Disponivel",
    "helpButtonDesc": "Pode reiniciar este tour a qualquer momento.",
    "next": "Proximo",
    "prev": "Anterior",
    "done": "Concluir",
    "progress": "{{current}} de {{total}}"
  }
}
```

---

## Fluxo do Utilizador

```text
+------------------------------------------+
|  PRIMEIRO LOGIN                          |
|                                          |
|  1. Modal de Boas-vindas aparece         |
|     - Stats impressionantes              |
|     - "Explorar" ou "Tour Guiado"        |
|                                          |
|  2a. Se "Tour Guiado":                   |
|      - Fecha modal                       |
|      - Inicia driver.js tour             |
|      - Highlight: sidebar -> stats ->    |
|        obras -> capturas -> ...          |
|      - Termina no botao de ajuda         |
|      - Guarda flag em localStorage       |
|                                          |
|  2b. Se "Explorar":                      |
|      - Fecha modal                       |
|      - Guarda flag em localStorage       |
|      - Botao para de pulsar              |
+------------------------------------------+

+------------------------------------------+
|  VISITAS SEGUINTES                       |
|                                          |
|  - Botao de ajuda sempre visivel         |
|  - Sem pulse animation                   |
|  - Click abre menu de ajuda:             |
|    - Reiniciar tour                      |
|    - Documentacao                        |
|    - Suporte                             |
|    - Atalhos de teclado                  |
+------------------------------------------+
```

---

## Ordem de Implementacao

1. Instalar driver.js
2. Adicionar CSS global (animacoes e estilos do tour)
3. Criar ProductTour.tsx com configuracao do driver.js
4. Criar WelcomeModal.tsx
5. Criar HelpMenu.tsx
6. Criar HelpButton.tsx
7. Criar KeyboardShortcutsModal.tsx (bonus)
8. Adicionar data-tour attributes ao Sidebar
9. Adicionar data-tour ao Dashboard
10. Integrar tudo no AppLayout.tsx
11. Adicionar traducoes
