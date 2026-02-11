import { PROJECT_TYPES } from './types';
import { formatFileSize } from './helpers';
import type { Project } from './types';

interface ProjectPreviewModalProps {
  project: Project | null;
  onClose: () => void;
  onDelete: (id: string, filePath: string) => void;
}

export default function ProjectPreviewModal({ project, onClose, onDelete }: ProjectPreviewModalProps) {
  if (!project) return null;
  const typeConfig = PROJECT_TYPES[project.type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="rounded-2xl border border-white/5 p-6 w-full max-w-sm" style={{ background: "#181c26" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${typeConfig?.color}15`, border: `1px solid ${typeConfig?.color}30` }}>
            {typeConfig?.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white truncate">{project.name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: typeConfig?.color }}>{typeConfig?.label}</span>
              {project.from_zip && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">ZIP</span>}
            </div>
          </div>
        </div>
        <div className="space-y-3 mb-6">
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <span className="text-[11px] text-gray-500">Formato</span>
            <span className="font-mono text-xs text-white uppercase">{project.format}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <span className="text-[11px] text-gray-500">Tamanho</span>
            <span className="text-xs text-white">{formatFileSize(project.file_size)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <span className="text-[11px] text-gray-500">Carregado em</span>
            <span className="text-xs text-white">{new Date(project.created_at).toLocaleDateString('pt-PT')}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-white/5 text-gray-400 text-xs font-semibold hover:border-white/10 transition-all">
            Fechar
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Remover "${project.name}"?`)) {
                onDelete(project.id, project.file_path);
                onClose();
              }
            }}
            className="flex-1 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/10 hover:border-red-500/30 transition-all"
          >
            🗑 Remover
          </button>
        </div>
      </div>
    </div>
  );
}
