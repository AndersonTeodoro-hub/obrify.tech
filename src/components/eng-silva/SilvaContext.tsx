import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SilvaIncompaticheckContext {
  chatMessages: Array<{ id: string; role: 'user' | 'agent'; content: string; created_at: string }>;
  agentThinking: boolean;
  sendUserMessage: (content: string) => Promise<string | undefined>;
  obraName?: string;
  findingsSummary?: string;
}

interface SilvaContextValue {
  incompaticheckContext: SilvaIncompaticheckContext | null;
  setIncompaticheckContext: (ctx: SilvaIncompaticheckContext | null) => void;
}

const SilvaContext = createContext<SilvaContextValue>({
  incompaticheckContext: null,
  setIncompaticheckContext: () => {},
});

export function SilvaContextProvider({ children }: { children: ReactNode }) {
  const [incompaticheckContext, setIncompaticheckContext] = useState<SilvaIncompaticheckContext | null>(null);

  return (
    <SilvaContext.Provider value={{ incompaticheckContext, setIncompaticheckContext }}>
      {children}
    </SilvaContext.Provider>
  );
}

export function useSilvaContext() {
  return useContext(SilvaContext);
}
