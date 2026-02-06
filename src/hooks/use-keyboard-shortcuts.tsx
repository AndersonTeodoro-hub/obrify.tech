import { useEffect } from 'react';

interface UseKeyboardShortcutsProps {
  onToggleAgent: () => void;
  onCloseAgent: () => void;
  isAgentOpen: boolean;
}

export function useKeyboardShortcuts({
  onToggleAgent,
  onCloseAgent,
  isAgentOpen,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K → toggle agent
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onToggleAgent();
        return;
      }

      // Escape → close agent if open
      if (e.key === 'Escape' && isAgentOpen) {
        e.preventDefault();
        onCloseAgent();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggleAgent, onCloseAgent, isAgentOpen]);
}
