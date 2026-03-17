import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { HelpButton } from '@/components/onboarding/HelpButton';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { startProductTour } from '@/components/onboarding/ProductTour';
import { ObrifyAgent } from '@/components/ai/ObrifyAgent';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { EngSilvaFAB } from '@/components/eng-silva/EngSilvaFAB';
import { EngSilvaPanel } from '@/components/eng-silva/EngSilvaPanel';
import { EngSilvaCallOverlay } from '@/components/eng-silva/EngSilvaCallOverlay';

export function AppLayout() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [silvaPanelOpen, setSilvaPanelOpen] = useState(false);
  const [silvaVoiceOpen, setSilvaVoiceOpen] = useState(false);
  const location = useLocation();

  const toggleAgent = useCallback(() => setAgentOpen(prev => !prev), []);
  const closeAgent = useCallback(() => setAgentOpen(false), []);

  useKeyboardShortcuts({
    onToggleAgent: toggleAgent,
    onCloseAgent: closeAgent,
    isAgentOpen: agentOpen,
  });

  useEffect(() => {
    const completed = localStorage.getItem('obrify_onboarding_completed');
    if (!completed) {
      setShowWelcome(true);
      setShowPulse(true);
    }
  }, []);

  const handleStartTour = () => {
    setShowWelcome(false);
    setTimeout(() => {
      startProductTour(() => setShowPulse(false));
    }, 300);
  };

  const handleExplore = () => {
    setShowWelcome(false);
    localStorage.setItem('obrify_onboarding_completed', 'true');
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

      <HelpButton showPulse={showPulse} onTourComplete={() => setShowPulse(false)} />
      <ObrifyAgent open={agentOpen} onOpenChange={setAgentOpen} />

      {/* Eng. Silva: FAB + Chat Panel + Voice Overlay */}
      {!silvaPanelOpen && (
        <EngSilvaFAB onClick={() => setSilvaPanelOpen(true)} />
      )}
      <EngSilvaPanel
        isOpen={silvaPanelOpen}
        onClose={() => setSilvaPanelOpen(false)}
        onStartVoiceCall={() => setSilvaVoiceOpen(true)}
      />
      <EngSilvaCallOverlay open={silvaVoiceOpen} onClose={() => setSilvaVoiceOpen(false)} />

      <WelcomeModal
        open={showWelcome}
        onOpenChange={setShowWelcome}
        onStartTour={handleStartTour}
        onExplore={handleExplore}
      />
    </SidebarProvider>
  );
}
