import { useState, useRef, useEffect, useCallback } from "react";
import AgentPanel from "./incompaticheck/AgentPanel";
import { generateAgentResponse, formatFileSize } from "./incompaticheck/helpers";

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string; border: string }> = {
  critical: { color: "#ff3b5c", bg: "rgba(255,59,92,0.1)", label: "Crítica", border: "rgba(255,59,92,0.25)" },
  warning: { color: "#ffd60a", bg: "rgba(255,214,10,0.1)", label: "Alerta", border: "rgba(255,214,10,0.25)" },
  info: { color: "#00c9a7", bg: "rgba(0,201,167,0.1)", label: "Observação", border: "rgba(0,201,167,0.25)" },
};

const PROJECT_TYPES: Record<string, { color: string; label: string; icon: string }> = {
  fundacoes: { color: "#ff6b35", label: "Fundações", icon: "⬡" },
  estrutural: { color: "#8b5cf6", label: "Estrutural", icon: "▦" },
  rede_enterrada: { color: "#00c9a7", label: "Rede Enterrada", icon: "◎" },
  terraplanagem: { color: "#ffd60a", label: "Terraplanagem", icon: "▧" },
};

const FILE_SIZE_LIMIT = 500 * 1024 * 1024;

interface Project {
  id: string;
  name: string;
  type: string;
  format: string;
  file_size: number;
  created_at: string;
}

interface Incompatibility {
  id: string;
  severity: string;
  title: string;
  description: string;
  location: string;
  tags: string[];
}

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

const MOCK_PROJECTS: Project[] = [
  { id: "1", name: "Fundações — Bloco A", type: "fundacoes", format: "dwg", file_size: 2400000, created_at: "2026-02-10" },
  { id: "2", name: "Rede Hidrossanitária", type: "rede_enterrada", format: "pdf", file_size: 1800000, created_at: "2026-02-10" },
  { id: "3", name: "Terraplanagem — Platô 01", type: "terraplanagem", format: "dwg", file_size: 3100000, created_at: "2026-02-09" },
  { id: "4", name: "Estrutural — Concreto Armado", type: "estrutural", format: "pdf", file_size: 4200000, created_at: "2026-02-09" },
  { id: "5", name: "Rede Elétrica Subterrânea", type: "rede_enterrada", format: "dwf", file_size: 1200000, created_at: "2026-02-08" },
];

const MOCK_INCOMPATIBILITIES: Incompatibility[] = [
  {
    id: "inc1", severity: "critical",
    title: "Colisão: Rede hidráulica DN150 × Bloco de fundação B2",
    description: "Tubulação hidráulica Ø150mm na cota -1.80m intercepta o bloco de coroamento B2 (cota fundo -2.00m). Conforme EN 1997-1 (Eurocódigo 7) e especificações do LNEC, o desvio mínimo necessário é de 0.45m lateral ou rebaixamento de 0.60m.",
    location: "Eixo 3 / P7", tags: ["rede_enterrada", "fundacoes"],
  },
  {
    id: "inc2", severity: "critical",
    title: "Divergência de cotas: Terraplanagem × Fundação Bloco A",
    description: "Cota de arrasamento do bloco B5 definida em -0.95m no projeto estrutural, porém a terraplanagem indica cota de plataforma acabada em -0.80m. Diferença de 0.15m pode expor o topo do bloco, violando NP EN 1992-1-1.",
    location: "Eixo 5 / B5", tags: ["terraplanagem", "fundacoes"],
  },
  {
    id: "inc3", severity: "critical",
    title: "Rede de esgoto sob sapata corrida SC-02",
    description: "Coletor de esgoto DN200 passa sob a sapata corrida SC-02 sem detalhe de travessia. A carga da fundação pode comprometer a tubulação — necessário caixa de passagem ou desvio conforme DR 23/95.",
    location: "Eixo 1-2 / SC-02", tags: ["rede_enterrada", "fundacoes"],
  },
  {
    id: "inc4", severity: "critical",
    title: "Estaca hélice contínua intercepta duto elétrico subterrâneo",
    description: "Estaca EHC-12 (Ø60cm) coincide com o traçado do eletroduto enterrado de média tensão. Reposicionamento necessário conforme RTIEBT.",
    location: "Eixo 8 / EHC-12", tags: ["fundacoes", "rede_enterrada"],
  },
  {
    id: "inc5", severity: "warning",
    title: "Viga baldrame VB-04 com cota incompatível com rede de gás",
    description: "Viga baldrame VB-04 (fundo -0.60m) cruza com tubulação de gás (-0.55m). Folga de 0.05m — Portaria 361/98 exige mínimo de 0.30m de separação vertical.",
    location: "Eixo 4 / VB-04", tags: ["estrutural", "rede_enterrada"],
  },
  {
    id: "inc6", severity: "warning",
    title: "Pilar P12 deslocado 0.10m em relação à fundação",
    description: "Centro geométrico do pilar P12 deslocado 10cm em X em relação ao eixo do bloco. Pode gerar momento fletor adicional não previsto (Eurocódigo 2, Secção 5.2).",
    location: "Eixo 6 / P12", tags: ["estrutural", "fundacoes"],
  },
  {
    id: "inc7", severity: "warning",
    title: "Nível de terraplanagem incompatível com viga de equilíbrio",
    description: "VE-01 entre B3 e B4 tem topo a -0.40m, mas terraplanagem indica aterro até -0.25m. Viga parcialmente exposta, comprometendo proteção conforme NP EN 206.",
    location: "Eixo 3-4 / VE-01", tags: ["terraplanagem", "estrutural"],
  },
  {
    id: "inc8", severity: "warning",
    title: "Caixa de visita CV-03 conflitua com bloco de fundação B6",
    description: "CV-03 da rede de drenagem sobrepõe-se ao bloco B6. Coordenadas coincidentes. Necessário reposicionar.",
    location: "Eixo 7 / B6-CV03", tags: ["rede_enterrada", "fundacoes"],
  },
  {
    id: "inc9", severity: "warning",
    title: "Passagem de tubagem não prevista na laje de piso",
    description: "DN100 pluviais necessita atravessar laje térreo junto ao P9, mas projeto estrutural não prevê negativo. Coordenar conforme NP EN 1992-1-1.",
    location: "Eixo 5 / P9", tags: ["estrutural", "rede_enterrada"],
  },
  {
    id: "inc10", severity: "warning",
    title: "Rampa de acesso interfere com muro de suporte MS-01",
    description: "Terraplanagem da rampa indica -2.80m junto ao MS-01, mas fundação do muro está a -2.50m. Risco de descalçamento (EN 1997-1, Secção 9).",
    location: "Eixo 2 / MS-01", tags: ["terraplanagem", "estrutural"],
  },
  {
    id: "inc11", severity: "warning",
    title: "Espaçamento insuficiente entre estacas e rede de abastecimento",
    description: "Estacas B10 a 0.20m da rede DN200. Cravação pode danificar tubulação. Mínimo recomendado: 0.50m.",
    location: "Eixo 10 / B10", tags: ["fundacoes", "rede_enterrada"],
  },
  {
    id: "inc12", severity: "info",
    title: "Profundidade de estaca próxima ao nível freático",
    description: "Estacas B8 com ponta a -8.50m. NA a -7.00m. Verificar método executivo conforme EN 1536.",
    location: "Eixo 9 / B8", tags: ["fundacoes", "terraplanagem"],
  },
  {
    id: "inc13", severity: "info",
    title: "Classe de exposição do betão pode necessitar revisão",
    description: "Fundações próximas à rede de drenagem. Verificar classe XA conforme NP EN 206, Quadro NA.2.",
    location: "Eixo 1-3 / Geral", tags: ["estrutural", "rede_enterrada"],
  },
  {
    id: "inc14", severity: "info",
    title: "Sondagens desatualizadas para zona de expansão",
    description: "Zona Eixos 11-14 referencia sondagens de 2023. LNEC recomenda atualizar quando superiores a 2 anos.",
    location: "Eixo 11-14 / Geral", tags: ["fundacoes", "terraplanagem"],
  },
];

function ProjectTypeBadge({ type }: { type: string }) {
  const config = PROJECT_TYPES[type];
  if (!config) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "6px",
        fontSize: "11px",
        fontWeight: 600,
        color: config.color,
        background: `${config.color}15`,
        border: `1px solid ${config.color}30`,
      }}
    >
      {config.icon} {config.label}
    </span>
  );
}

function StatCard({ number, label, type }: { number: string | number; label: string; type: string }) {
  const colors: Record<string, string> = { critical: "#ff3b5c", warning: "#ffd60a", info: "#00c9a7", ok: "#4ade80" };
  const color = colors[type] || "#888";
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "16px",
        padding: "20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "32px", fontWeight: 800, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: "12px", color: "#888", marginTop: "6px", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function CrossSectionSVG() {
  return (
    <svg viewBox="0 0 600 300" style={{ width: "100%", height: "auto", borderRadius: "12px", background: "#0a0a0a" }}>
      {/* Ground level */}
      <line x1="0" y1="100" x2="600" y2="100" stroke="#333" strokeWidth="1" strokeDasharray="4" />
      <text x="10" y="95" fill="#666" fontSize="10">NTN ±0.00</text>

      {/* Foundation block 1 */}
      <rect x="80" y="120" width="120" height="100" fill="rgba(139,92,246,0.15)" stroke="#8b5cf6" strokeWidth="1.5" rx="4" />
      <text x="105" y="175" fill="#8b5cf6" fontSize="11" fontWeight="600">B1 - 120×100</text>

      {/* Foundation block 2 */}
      <rect x="350" y="110" width="140" height="120" fill="rgba(139,92,246,0.15)" stroke="#8b5cf6" strokeWidth="1.5" rx="4" />
      <text x="370" y="175" fill="#8b5cf6" fontSize="11" fontWeight="600">B2 - 140×120</text>

      {/* Pillars */}
      <rect x="125" y="70" width="30" height="50" fill="rgba(255,107,53,0.2)" stroke="#ff6b35" strokeWidth="1.5" rx="2" />
      <text x="128" y="65" fill="#ff6b35" fontSize="10" fontWeight="600">P3</text>

      <rect x="400" y="60" width="30" height="50" fill="rgba(255,107,53,0.2)" stroke="#ff6b35" strokeWidth="1.5" rx="2" />
      <text x="403" y="55" fill="#ff6b35" fontSize="10" fontWeight="600">P7</text>

      {/* Pipe - collision */}
      <line x1="50" y1="180" x2="550" y2="180" stroke="#00c9a7" strokeWidth="3" />
      <circle cx="420" cy="180" r="12" fill="none" stroke="#ff3b5c" strokeWidth="2">
        <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x="440" y="185" fill="#ff3b5c" fontSize="11" fontWeight="700">⚠ COLISÃO</text>

      {/* Dimensions */}
      <text x="110" y="240" fill="#666" fontSize="9">1.20m</text>
      <text x="390" y="250" fill="#666" fontSize="9">1.40m</text>
      <text x="270" y="290" fill="#555" fontSize="10">3.00m</text>
    </svg>
  );
}

function UploadModal({ isOpen, onClose, onUpload }: { isOpen: boolean; onClose: () => void; onUpload: (p: any) => void }) {
  const [selectedType, setSelectedType] = useState("fundacoes");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (file.size > FILE_SIZE_LIMIT) { alert("Ficheiro excede 500MB."); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "dwg", "dwf", "ifc"].includes(ext)) { alert("Formato não suportado."); return; }
    onUpload({ name: file.name, type: selectedType, format: ext, file_size: file.size, file });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px",
          padding: "32px", width: "90%", maxWidth: "480px",
        }}
      >
        <h3 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Upload de Projeto</h3>
        <p style={{ color: "#888", fontSize: "13px", marginBottom: "20px" }}>Carregue o ficheiro. Limite: 500MB. Formatos: PDF, DWG, DWF, IFC.</p>

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.[0]) handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragOver ? "rgba(255,165,0,0.6)" : "rgba(255,165,0,0.2)"}`,
            borderRadius: "12px", padding: "40px", textAlign: "center", cursor: "pointer",
            marginBottom: "24px", background: dragOver ? "rgba(255,165,0,0.05)" : "transparent",
            transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📁</div>
          <div style={{ color: "#ccc", fontSize: "14px", fontWeight: 600 }}>Arraste o ficheiro para aqui</div>
          <div style={{ color: "#666", fontSize: "12px", marginTop: "4px" }}>PDF, DWG, DWF, IFC — máx. 500MB</div>
          <input ref={fileRef} type="file" accept=".pdf,.dwg,.dwf,.ifc" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>

        <div style={{ color: "#aaa", fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>Tipo de projeto</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "24px" }}>
          {Object.entries(PROJECT_TYPES).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setSelectedType(key)}
              style={{
                padding: "12px", borderRadius: "12px", textAlign: "left", cursor: "pointer",
                background: selectedType === key ? "rgba(255,165,0,0.08)" : "transparent",
                border: `1px solid ${selectedType === key ? "rgba(255,165,0,0.3)" : "rgba(255,255,255,0.05)"}`,
                color: "#ccc", fontSize: "13px", fontWeight: 500, transition: "all 0.2s",
              }}
            >
              {val.icon} {val.label}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent", color: "#888", cursor: "pointer", fontSize: "13px",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ShareModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [shareType, setShareType] = useState("email");

  if (!isOpen) return null;

  const handleShare = () => {
    if (shareType === "email" && email) {
      window.open(`mailto:${email}?subject=${encodeURIComponent("Relatório de Incompatibilidades — Obrify IncompatiCheck")}&body=${encodeURIComponent("Segue em anexo o relatório de análise de incompatibilidades gerado pela plataforma Obrify IncompatiCheck.")}`);
    } else if (shareType === "whatsapp" && phone) {
      window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent("📋 Relatório de Incompatibilidades — Obrify IncompatiCheck\n\n4 Incompatibilidades Críticas detectadas.\n\nGerado pela plataforma Obrify.")}`);
    }
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px",
          padding: "32px", width: "90%", maxWidth: "480px",
        }}
      >
        <h3 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Partilhar Relatório</h3>
        <p style={{ color: "#888", fontSize: "13px", marginBottom: "20px" }}>Envie o relatório em formato profissional (PT-PT).</p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button
            onClick={() => setShareType("email")}
            style={{
              flex: 1, padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s",
              border: `1px solid ${shareType === "email" ? "rgba(255,165,0,0.4)" : "rgba(255,255,255,0.05)"}`,
              background: shareType === "email" ? "rgba(255,165,0,0.08)" : "transparent",
              color: shareType === "email" ? "#f59e0b" : "#888",
            }}
          >
            📧 Email
          </button>
          <button
            onClick={() => setShareType("whatsapp")}
            style={{
              flex: 1, padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s",
              border: `1px solid ${shareType === "whatsapp" ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.05)"}`,
              background: shareType === "whatsapp" ? "rgba(34,197,94,0.08)" : "transparent",
              color: shareType === "whatsapp" ? "#22c55e" : "#888",
            }}
          >
            📱 WhatsApp
          </button>
        </div>

        {shareType === "email" ? (
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="engenheiro@empresa.pt"
            style={{
              width: "100%", padding: "12px 16px", borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.05)", color: "#fff", fontSize: "13px",
              outline: "none", background: "rgba(255,255,255,0.03)", marginBottom: "24px",
            }}
          />
        ) : (
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+351 912 345 678"
            style={{
              width: "100%", padding: "12px 16px", borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.05)", color: "#fff", fontSize: "13px",
              outline: "none", background: "rgba(255,255,255,0.03)", marginBottom: "24px",
            }}
          />
        )}

        <div style={{ marginBottom: "24px" }}>
          <div style={{ color: "#aaa", fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>Conteúdo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ color: "#666", fontSize: "12px" }}>✓ Resumo executivo — 14 incompatibilidades</div>
            <div style={{ color: "#666", fontSize: "12px" }}>✓ Fichas técnicas detalhadas</div>
            <div style={{ color: "#666", fontSize: "12px" }}>✓ Referências normativas (NP EN, Eurocódigos)</div>
            <div style={{ color: "#666", fontSize: "12px" }}>✓ Recomendações de solução</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "10px", borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
              color: "#888", cursor: "pointer", fontSize: "13px",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleShare}
            style={{
              flex: 1, padding: "10px", borderRadius: "10px", border: "none",
              background: "linear-gradient(135deg, #f59e0b, #ea580c)", color: "#fff",
              cursor: "pointer", fontSize: "13px", fontWeight: 600,
            }}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IncompatiCheck() {
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [filter, setFilter] = useState("all");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "agent", content: `Olá! Sou o **Eng. Marcos**, especialista em compatibilização com +10 anos de experiência em fundações, estruturas de betão armado e redes enterradas, com foco na regulamentação europeia e portuguesa (Eurocódigos, NP EN 206, DR 23/95, RTIEBT).\n\nIdentifiquei **4 incompatibilidades críticas**. A mais urgente: colisão da rede hidráulica DN150 com o bloco B2 no Eixo 3.\n\nPode falar por voz ou digitar. Estou à disposição.` },
  ]);
  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const incompatibilities = MOCK_INCOMPATIBILITIES;
  const filteredIncomp = filter === "all" ? incompatibilities : incompatibilities.filter(i => i.severity === filter);
  const criticalCount = incompatibilities.filter(i => i.severity === "critical").length;
  const warningCount = incompatibilities.filter(i => i.severity === "warning").length;
  const infoCount = incompatibilities.filter(i => i.severity === "info").length;

  const addMessage = useCallback((content: string, role: "user" | "agent") => {
    setChatMessages(prev => [...prev, { role, content }]);
  }, []);

  const handleUpload = useCallback((project: any) => {
    setProjects(prev => [...prev, { id: String(Date.now()), name: project.name, type: project.type, format: project.format, file_size: project.file_size, created_at: new Date().toISOString().slice(0, 10) }]);
    addMessage(`Projeto "${project.name}" carregado. A analisar...`, "agent");
    setTimeout(() => addMessage("Análise concluída. **2 novas interferências** detectadas. Deseja detalhes?", "agent"), 2000);
  }, [addMessage]);

  const runAnalysis = useCallback(() => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      addMessage(`Análise completa! **92 elementos estruturais**, **30 trechos de rede**, **6 secções de terraplanagem**. Total: **${incompatibilities.length} incompatibilidades** (${criticalCount} críticas, ${warningCount} alertas, ${infoCount} observações).`, "agent");
    }, 3500);
  }, [addMessage, incompatibilities.length, criticalCount, warningCount, infoCount]);

  return (
    <div style={{ height: "100vh", background: "#0a0a0a", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* HEADER */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #f59e0b, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "14px" }}>O</div>
          <div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: "15px" }}>Obrify IncompatiCheck</span>
            <span style={{ color: "#555", fontSize: "10px", marginLeft: "8px" }}>Módulo v2.4</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setShowUpload(true)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)", background: "#181c26", color: "#888", fontSize: "12px", cursor: "pointer" }}>📁 Upload</button>
          <button onClick={() => setShowShare(true)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)", background: "#181c26", color: "#888", fontSize: "12px", cursor: "pointer" }}>📤 Partilhar</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* SIDEBAR */}
        <div style={{ width: "260px", minWidth: "260px", borderRight: "1px solid rgba(255,255,255,0.04)", padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ color: "#888", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>Projetos ({projects.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {projects.map(p => (
              <div key={p.id} style={{ padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.02)", cursor: "pointer" }}>
                <ProjectTypeBadge type={p.type} />
                <div style={{ color: "#ccc", fontSize: "12px", fontWeight: 600, marginTop: "6px" }}>{p.name}</div>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <span style={{ fontSize: "10px", color: "#555" }}>{p.format.toUpperCase()}</span>
                  <span style={{ fontSize: "10px", color: "#555" }}>{formatFileSize(p.file_size)}</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowUpload(true)} style={{ width: "100%", border: "2px dashed rgba(255,165,0,0.15)", borderRadius: "12px", padding: "24px", textAlign: "center", background: "transparent", cursor: "pointer", color: "#888" }}>
            <div style={{ fontSize: "24px", marginBottom: "4px" }}>📁</div>
            <div style={{ fontSize: "12px", fontWeight: 600 }}>Carregar Projeto</div>
            <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>PDF · DWG · DWF · IFC</div>
          </button>
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {isAnalyzing && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px", marginBottom: "20px", borderRadius: "12px", background: "rgba(255,165,0,0.05)", border: "1px solid rgba(255,165,0,0.15)" }}>
              <div style={{ width: "20px", height: "20px", border: "2px solid #f59e0b", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ color: "#f59e0b", fontSize: "13px" }}>A analisar incompatibilidades...</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
            <div>
              <h2 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: 0 }}>Análise de Incompatibilidades</h2>
              <p style={{ color: "#555", fontSize: "12px", marginTop: "4px" }}>{projects.length} projetos · Última análise: 11 Fev 2026</p>
            </div>
            <button onClick={runAnalysis} disabled={isAnalyzing} style={{ padding: "10px 20px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #f59e0b, #ea580c)", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: isAnalyzing ? 0.5 : 1 }}>
              ▶ Executar Análise
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
            <StatCard number={criticalCount} label="Críticas" type="critical" />
            <StatCard number={warningCount} label="Alertas" type="warning" />
            <StatCard number={infoCount} label="Observações" type="info" />
            <StatCard number={projects.length} label="Projetos" type="ok" />
          </div>

          {/* Cross section */}
          <div style={{ marginBottom: "24px", background: "rgba(255,255,255,0.02)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.04)", padding: "20px" }}>
            <div style={{ color: "#888", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>Secção Transversal — Eixo 3</div>
            <CrossSectionSVG />
            <div style={{ display: "flex", gap: "16px", marginTop: "12px", justifyContent: "center" }}>
              {[{ c: "#00c9a7", l: "Hidráulica" }, { c: "#8b5cf6", l: "Esgoto" }, { c: "#ffd60a", l: "Gás" }, { c: "#ff3b5c", l: "Elétrica" }, { c: "#4a4a50", l: "Betão" }].map(x => (
                <div key={x.l} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#666" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: x.c }} />
                  {x.l}
                </div>
              ))}
            </div>
          </div>

          {/* Incompatibilities list */}
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.04)", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ color: "#888", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>Incompatibilidades ({filteredIncomp.length})</div>
              <div style={{ display: "flex", gap: "6px" }}>
                {[{ k: "all", l: "Todas" }, { k: "critical", l: "Críticas" }, { k: "warning", l: "Alertas" }, { k: "info", l: "Info" }].map(f => (
                  <button key={f.k} onClick={() => setFilter(f.k)} style={{
                    padding: "4px 12px", borderRadius: "20px", fontSize: "11px", cursor: "pointer",
                    border: filter === f.k ? "1px solid rgba(255,165,0,0.3)" : "1px solid rgba(255,255,255,0.05)",
                    background: filter === f.k ? "rgba(255,165,0,0.1)" : "transparent",
                    color: filter === f.k ? "#f59e0b" : "#555",
                  }}>{f.l}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredIncomp.map(inc => {
                const sev = SEVERITY_CONFIG[inc.severity];
                return (
                  <div key={inc.id} style={{ display: "flex", gap: "12px", padding: "14px", borderRadius: "12px", border: `1px solid ${sev?.border || "rgba(255,255,255,0.04)"}`, background: sev?.bg || "transparent" }}>
                    <div style={{ width: "4px", borderRadius: "4px", background: sev?.color || "#555", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                        <div style={{ color: "#ddd", fontSize: "13px", fontWeight: 600 }}>{inc.title}</div>
                        <span style={{ fontSize: "10px", color: "#555", flexShrink: 0 }}>{inc.location}</span>
                      </div>
                      <p style={{ color: "#888", fontSize: "11px", lineHeight: 1.5, margin: "0 0 8px 0" }}>{inc.description}</p>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {inc.tags.map(t => <ProjectTypeBadge key={t} type={t} />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* AGENT PANEL */}
        <AgentPanel chatMessages={chatMessages} onAddMessage={addMessage} />
      </div>

      <UploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onUpload={handleUpload} />
      <ShareModal isOpen={showShare} onClose={() => setShowShare(false)} />

      <style>{`
        @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(255,107,53,0.5); } 70% { box-shadow: 0 0 0 20px rgba(255,107,53,0); } 100% { box-shadow: 0 0 0 0 rgba(255,107,53,0); } }
        @keyframes wave { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export { MOCK_PROJECTS, MOCK_INCOMPATIBILITIES, SEVERITY_CONFIG, PROJECT_TYPES, FILE_SIZE_LIMIT, StatCard, CrossSectionSVG, ProjectTypeBadge, UploadModal, ShareModal };
export type { Project, Incompatibility, ChatMessage };
