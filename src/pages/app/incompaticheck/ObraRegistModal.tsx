import { useState } from 'react';

interface ObraRegistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (info: { nome: string; cidade: string; fiscal: string }) => void;
}

export default function ObraRegistModal({ isOpen, onClose, onConfirm }: ObraRegistModalProps) {
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [fiscal, setFiscal] = useState('');

  if (!isOpen) return null;

  const canSubmit = nome.trim().length > 0;

  const handleSubmit = () => {
    if (canSubmit) {
      onConfirm({ nome: nome.trim(), cidade: cidade.trim(), fiscal: fiscal.trim() });
      setNome(''); setCidade(''); setFiscal('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="rounded-2xl border border-white/5 p-6 sm:p-8 w-full max-w-md" style={{ background: "#181c26" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: "linear-gradient(135deg, #ff6b35, #ff8c5a)" }}>O</div>
          <h2 className="text-lg font-bold text-white">Registar Obra</h2>
        </div>
        <p className="text-xs text-gray-400 mb-6">Identifique a obra para associar os projetos e análises.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Nome da Obra *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Edifício Residencial Tejo Park"
              className="w-full px-4 py-3 rounded-xl border border-white/5 text-white text-sm outline-none focus:border-orange-500/30 placeholder:text-gray-600 transition-all" style={{ background: "rgba(255,255,255,0.03)" }} />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Cidade / Localização</label>
            <input type="text" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex: Lisboa, Parque das Nações"
              className="w-full px-4 py-3 rounded-xl border border-white/5 text-white text-sm outline-none focus:border-orange-500/30 placeholder:text-gray-600 transition-all" style={{ background: "rgba(255,255,255,0.03)" }} />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Fiscal / Analisador</label>
            <input type="text" value={fiscal} onChange={e => setFiscal(e.target.value)} placeholder="Ex: Eng. João Silva"
              className="w-full px-4 py-3 rounded-xl border border-white/5 text-white text-sm outline-none focus:border-orange-500/30 placeholder:text-gray-600 transition-all" style={{ background: "rgba(255,255,255,0.03)" }} />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-white/5 text-gray-400 text-sm font-semibold hover:border-white/10 transition-all">Cancelar</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="flex-1 px-4 py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-30"
            style={{ background: "linear-gradient(135deg, #ff6b35, #ff8c5a)" }}>
            Registar
          </button>
        </div>
      </div>
    </div>
  );
}
