import type { Obra } from './types';

interface ObraListModalProps {
  isOpen: boolean;
  onClose: () => void;
  obras: Obra[];
  obraAtiva: Obra | null;
  onSelect: (obra: Obra) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export default function ObraListModal({ isOpen, onClose, obras, obraAtiva, onSelect, onDelete, onNew }: ObraListModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="rounded-2xl border border-white/5 p-6 w-full max-w-lg max-h-[80vh] flex flex-col" style={{ background: "#181c26" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Obras Registadas</h2>
            <p className="text-xs text-gray-400 mt-0.5">{obras.length} obra{obras.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onNew}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg, #ff6b35, #ff8c5a)" }}>
            + Nova Obra
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1" style={{ scrollbarWidth: "thin" }}>
          {obras.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">🏗️</div>
              <div className="text-sm text-gray-400 mb-1">Nenhuma obra registada</div>
              <div className="text-xs text-gray-500">Clique em "Nova Obra" para começar</div>
            </div>
          ) : (
            obras.map(obra => {
              const isActive = obraAtiva?.id === obra.id;
              return (
                <div key={obra.id}
                  className={`group relative rounded-xl border p-4 cursor-pointer transition-all ${isActive ? 'border-orange-500/30 bg-orange-500/5' : 'border-white/5 hover:border-white/10'}`}
                  onClick={() => { onSelect(obra); onClose(); }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-white truncate">{obra.nome}</h3>
                        {isActive && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wider" style={{ background: "rgba(255,107,53,0.15)", color: "#ff6b35", border: "1px solid rgba(255,107,53,0.25)" }}>
                            Ativa
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        {obra.cidade && <span>📍 {obra.cidade}</span>}
                        {obra.fiscal && <span>👷 {obra.fiscal}</span>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Remover a obra "${obra.nome}" e todos os dados associados?`)) {
                          onDelete(obra.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-[11px] border border-white/5 text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-all"
                      style={{ background: "rgba(255,255,255,0.03)" }}
                      title="Remover obra"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl border border-white/5 text-gray-400 text-xs font-semibold hover:border-white/10 transition-all">
          Fechar
        </button>
      </div>
    </div>
  );
}
