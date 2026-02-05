import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { HelpButton } from '@/components/onboarding/HelpButton';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { startProductTour } from '@/components/onboarding/ProductTour';

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
      startProductTour(() => setShowPulse(false));
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

      <HelpButton showPulse={showPulse} onTourComplete={() => setShowPulse(false)} />

      <WelcomeModal
        open={showWelcome}
        onOpenChange={setShowWelcome}
        onStartTour={handleStartTour}
        onExplore={handleExplore}
      />
    </SidebarProvider>
  );
}
