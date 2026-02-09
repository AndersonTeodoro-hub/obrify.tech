import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export function startProductTour(onComplete?: () => void) {
  const tourSteps = [
    {
      element: '[data-tour="sidebar"]',
      popover: {
        title: '📍 Navegação Principal',
        description: 'Aqui encontra todas as secções da plataforma: obras, capturas, inspeções, não-conformidades e relatórios.',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="dashboard-stats"]',
      popover: {
        title: '📊 Visão Geral',
        description: 'O dashboard mostra as métricas mais importantes: obras activas, capturas, NCs abertas e taxa de conformidade.',
        side: 'bottom' as const,
      },
    },
    {
      element: '[data-tour="sites"]',
      popover: {
        title: '🏗️ Gestão de Obras',
        description: 'Crie e organize as suas obras com hierarquia completa: Pisos → Áreas → Pontos de Captura.',
        side: 'right' as const,
      },
    },
    {
      element: '[data-tour="captures"]',
      popover: {
        title: '📸 Capturas Inteligentes',
        description: 'Faça upload de fotos, vídeos e imagens 360°. A IA analisa automaticamente e detecta problemas!',
        side: 'right' as const,
      },
    },
    {
      element: '[data-tour="inspections"]',
      popover: {
        title: '📋 Inspeções Digitais',
        description: 'Crie checklists personalizados e execute inspeções estruturadas. Tudo fica registado automaticamente.',
        side: 'right' as const,
      },
    },
    {
      element: '[data-tour="nonconformities"]',
      popover: {
        title: '⚠️ Não-Conformidades',
        description: 'Registe problemas com evidências fotográficas. Acompanhe o estado de resolução de cada NC.',
        side: 'right' as const,
      },
    },
    {
      element: '[data-tour="reports"]',
      popover: {
        title: '📄 Relatórios Automáticos',
        description: 'Gere relatórios PDF profissionais com um clique: relatórios de inspeção, listagem de NCs e mais.',
        side: 'right' as const,
      },
    },
    {
      element: '[data-tour="help-button"]',
      popover: {
        title: '💡 Sempre Disponível',
        description: 'Pode reiniciar este tour a qualquer momento clicando neste botão. Boas fiscalizações!',
        side: 'left' as const,
      },
    },
  ];

  const driverObj = driver({
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Próximo',
    prevBtnText: 'Anterior',
    doneBtnText: 'Concluir',
    animate: true,
    overlayColor: 'rgba(0, 0, 0, 0.75)',
    stagePadding: 8,
    stageRadius: 12,
    popoverClass: 'obrify-tour-popover',
    steps: tourSteps,
    onDestroyed: () => {
      localStorage.setItem('obrify_onboarding_completed', 'true');
      onComplete?.();
    },
  });

  driverObj.drive();
}
