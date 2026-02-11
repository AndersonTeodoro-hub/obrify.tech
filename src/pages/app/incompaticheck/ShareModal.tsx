import { useState } from 'react';
import type { Obra } from './types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  obraAtiva: Obra | null;
  findingsCount: { critical: number; warning: number; info: number };
  onGenerateReport: () => Promise<Blob | null>;
}

export default function ShareModal({ isOpen, onClose, obraAtiva, findingsCount, onGenerateReport }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shareType, setShareType] = useState('download');
  const [generating, setGenerating] = useState(false);

  if (!isOpen) return null;

  const obraNome = obraAtiva?.nome || 'Obra';
  const totalFindings = findingsCount.critical + findingsCount.warning + findingsCount.info;

  const handleAction = async () => {
    setGenerating(true);
    try {
      const blob = await onGenerateReport();
      if (!blob) { setGenerating(false); return; }

      if (shareType === 'download') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Relatorio_IncompatiCheck_${obraNome.replace(/\s/g, '_')}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (shareType === 'email' && email) {
        window.open(`mailto:${email}?subject=${encodeURIComponent(`Relatório de Incompatibilidades — ${obraNome}`)}&body=${encodeURIComponent(`Relatório de análise de incompatibilidades.\n\n🏗️ Obra: ${obraNome}\n${obraAtiva?.cidade ? `📍 ${obraAtiva.cidade}\n` : ''}${obraAtiva?.fiscal ? `👷 ${obraAtiva.fiscal}\n` : ''}\n${findingsCount.critical} críticas, ${findingsCount.warning} alertas, ${findingsCount.info} observações.\n\nGerado por Obrify IncompatiCheck.`)}`);
      } else if (shareType === 'whatsapp' && phone) {
        window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`📋 Relatório IncompatiCheck\n🏗️ ${obraNome}\n${findingsCount.critical} críticas, ${findingsCount.warning} alertas\nGerado por Obrify.`)}`);
      }
    } catch (e) {
      console.error('Report error:', e);
    }
    setGenerating(false);
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "32px", width: "90%", maxWidth: "480px" }}>
        <h3 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Partilhar Relatório</h3>
        <p style={{ color: "#888", fontSize: "13px", marginBottom: "20px" }}>PDF com {totalFindings} incompatibilidades detectadas.</p>

        <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
          {(['download', 'email', 'whatsapp'] as const).map(t => (
            <button key={t} onClick={() => setShareType(t)} style={{
              flex: 1, padding: "10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
              border: `1px solid ${shareType === t ? "rgba(255,165,0,0.4)" : "rgba(255,255,255,0.05)"}`,
              background: shareType === t ? "rgba(255,165,0,0.08)" : "transparent",
              color: shareType === t ? "#f59e0b" : "#888",
            }}>
              {t === 'download' ? '📥 Download' : t === 'email' ? '📧 Email' : '📱 WhatsApp'}
            </button>
          ))}
        </div>

        {shareType === 'email' && (
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="engenheiro@empresa.pt"
            style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", color: "#fff", fontSize: "13px", outline: "none", background: "rgba(255,255,255,0.03)", marginBottom: "20px" }} />
        )}
        {shareType === 'whatsapp' && (
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+351 912 345 678"
            style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", color: "#fff", fontSize: "13px", outline: "none", background: "rgba(255,255,255,0.03)", marginBottom: "20px" }} />
        )}

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", cursor: "pointer", fontSize: "13px" }}>
            Cancelar
          </button>
          <button onClick={handleAction} disabled={generating || (shareType === 'email' && !email) || (shareType === 'whatsapp' && !phone)}
            style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, #f59e0b, #ea580c)", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 600, opacity: generating ? 0.5 : 1 }}>
            {generating ? 'A gerar...' : shareType === 'download' ? 'Descarregar PDF' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
