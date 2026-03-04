import { Phone } from 'lucide-react';

interface EngSilvaFABProps {
  onClick: () => void;
}

export function EngSilvaFAB({ onClick }: EngSilvaFABProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-28 right-5 z-50 flex flex-col items-center gap-1 group"
      aria-label="Ligar para Eng. Silva"
    >
      <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg eng-silva-pulse"
        style={{
          background: 'linear-gradient(135deg, #D4A849, #C4933A)',
        }}
      >
        <Phone className="w-7 h-7 text-white" />
      </div>
      <span className="text-[10px] font-medium" style={{ color: '#D4A849' }}>
        Eng. Silva
      </span>
    </button>
  );
}
