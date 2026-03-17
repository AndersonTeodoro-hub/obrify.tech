import { MessageSquare } from 'lucide-react';

interface EngSilvaFABProps {
  onClick: () => void;
}

export function EngSilvaFAB({ onClick }: EngSilvaFABProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-1 group"
      aria-label="Abrir Eng. Silva"
    >
      <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all text-xl"
        style={{
          background: 'linear-gradient(135deg, #D4A849, #C4933A)',
        }}
      >
        🔬
      </div>
      <span className="text-[10px] font-medium" style={{ color: '#D4A849' }}>
        Eng. Silva
      </span>
    </button>
  );
}
