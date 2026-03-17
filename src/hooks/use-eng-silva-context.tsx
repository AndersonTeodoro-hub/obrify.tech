import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface EngSilvaContextData {
  /** Chat messages (persistent from IncompatiCheck) */
  chatMessages: Array<{ id: string; role: 'user' | 'agent'; content: string; created_at: string }>;
  agentThinking: boolean;
  sendUserMessage: (content: string) => Promise<string | undefined>;
  obraName?: string;
  /** IncompatiCheck findings */
  findings?: Array<{ severity: string; title: string; description: string; location?: string }>;
  /** PDE analysis results (parecer técnico) */
  pdeAnalyses?: Array<{
    verdict: string | null;
    ai_analysis: {
      summary: string;
      findings_addressed?: Array<{ finding_title: string; resolved: boolean; comment: string }>;
      new_issues?: Array<{ severity: string; title: string; description: string; location?: string }>;
      technical_notes?: string[];
      recommendation?: string;
    } | null;
    completed_at: string | null;
  }>;
  /** Projects loaded in the obra */
  projects?: Array<{ name: string; type: string }>;
}

interface EngSilvaContextValue {
  context: EngSilvaContextData | null;
  setContext: (ctx: EngSilvaContextData | null) => void;
}

const EngSilvaContext = createContext<EngSilvaContextValue>({
  context: null,
  setContext: () => {},
});

export function EngSilvaProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<EngSilvaContextData | null>(null);

  return (
    <EngSilvaContext.Provider value={{ context, setContext }}>
      {children}
    </EngSilvaContext.Provider>
  );
}

export function useEngSilvaContext() {
  return useContext(EngSilvaContext);
}
