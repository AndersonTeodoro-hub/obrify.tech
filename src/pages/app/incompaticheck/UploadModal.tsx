import { useState, useRef } from 'react';
import { PROJECT_TYPES, FILE_SIZE_LIMIT } from './types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, type: string) => Promise<void>;
  obraNome?: string;
  uploadProgress: string | null;
}

export default function UploadModal({ isOpen, onClose, onUpload, obraNome, uploadProgress }: UploadModalProps) {
  const [selectedType, setSelectedType] = useState('fundacoes');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isUploading = !!uploadProgress;

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > FILE_SIZE_LIMIT) { setError('Ficheiro excede o limite de 50MB.'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext !== 'pdf') { setError('Formato não suportado. Utilize apenas ficheiros PDF.'); return; }
    try {
      await onUpload(file, selectedType);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro no upload.');
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "32px", width: "90%", maxWidth: "480px" }}>
        <h3 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>Upload de Projecto</h3>
        {obraNome && <div style={{ color: "#ff6b35", fontSize: "11px", marginBottom: "8px" }}>Obra: {obraNome}</div>}
        <p style={{ color: "#888", fontSize: "13px", marginBottom: "20px" }}>Limite: 50MB por ficheiro. Formato: PDF</p>

        <div
          onClick={() => !isUploading && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.[0]) handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragOver ? "rgba(255,165,0,0.6)" : "rgba(255,165,0,0.2)"}`,
            borderRadius: "12px", padding: "40px", textAlign: "center", cursor: isUploading ? "default" : "pointer",
            marginBottom: "20px", background: dragOver ? "rgba(255,165,0,0.05)" : "transparent", transition: "all 0.2s",
            opacity: isUploading ? 0.5 : 1,
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
          <div style={{ color: "#ccc", fontSize: "14px", fontWeight: 600 }}>Arraste o ficheiro PDF para aqui</div>
          <div style={{ color: "#666", fontSize: "12px", marginTop: "4px" }}>PDF — máx. 50MB</div>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>

        {error && (
          <div style={{ color: "#ff3b5c", fontSize: "12px", marginBottom: "12px", padding: "8px 12px", borderRadius: "8px", background: "rgba(255,59,92,0.1)", border: "1px solid rgba(255,59,92,0.2)" }}>
            {error}
          </div>
        )}

        {uploadProgress && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-300">{uploadProgress}</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-full rounded-full animate-pulse" style={{ width: "60%", background: "linear-gradient(90deg, #ff6b35, #ff8c5a)" }} />
            </div>
          </div>
        )}

        <div style={{ color: "#aaa", fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>Tipo de projecto</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
          {Object.entries(PROJECT_TYPES).map(([key, val]) => (
            <button key={key} onClick={() => setSelectedType(key)} style={{
              padding: "12px", borderRadius: "12px", textAlign: "left", cursor: "pointer",
              background: selectedType === key ? "rgba(255,165,0,0.08)" : "transparent",
              border: `1px solid ${selectedType === key ? "rgba(255,165,0,0.3)" : "rgba(255,255,255,0.05)"}`,
              color: "#ccc", fontSize: "13px", fontWeight: 500, transition: "all 0.2s",
            }}>
              {val.icon} {val.label}
            </button>
          ))}
        </div>

        <button onClick={onClose} disabled={isUploading} style={{
          width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)",
          background: "transparent", color: "#888", cursor: "pointer", fontSize: "13px",
          opacity: isUploading ? 0.3 : 1, pointerEvents: isUploading ? "none" : "auto",
        }}>
          {isUploading ? "A enviar..." : "Cancelar"}
        </button>
      </div>
    </div>
  );
}
