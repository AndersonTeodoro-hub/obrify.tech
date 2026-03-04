export interface Obra {
  id: string;
  user_id: string;
  nome: string;
  cidade: string;
  fiscal: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  obra_id: string;
  name: string;
  type: ProjectType;
  format: string;
  file_path: string;
  file_size: number;
  from_zip: boolean;
  created_at: string;
}

export type ProjectType = 'fundacoes' | 'estrutural' | 'rede_enterrada' | 'terraplanagem' | 'arquitectura' | 'avac' | 'aguas_esgotos' | 'electricidade';

export interface Analysis {
  id: string;
  user_id: string;
  obra_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_projects: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface Finding {
  id: string;
  analysis_id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  location: string;
  tags: string[];
  resolved: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  obra_id: string | null;
  role: 'user' | 'agent';
  content: string;
  created_at: string;
}

export interface Report {
  id: string;
  user_id: string;
  analysis_id: string;
  obra_id: string;
  pdf_path: string | null;
  shared_via: string[];
  created_at: string;
}

export const PROJECT_TYPES: Record<string, { color: string; label: string; icon: string }> = {
  fundacoes: { color: "#ff6b35", label: "Fundações", icon: "⬡" },
  estrutural: { color: "#8b5cf6", label: "Estrutural", icon: "▦" },
  rede_enterrada: { color: "#00c9a7", label: "Rede Enterrada", icon: "◎" },
  terraplanagem: { color: "#ffd60a", label: "Terraplanagem", icon: "▧" },
  arquitectura: { color: "#3b82f6", label: "Arquitectura", icon: "◫" },
  avac: { color: "#06b6d4", label: "AVAC", icon: "◈" },
  aguas_esgotos: { color: "#2563eb", label: "Águas e Esgotos", icon: "◉" },
  electricidade: { color: "#eab308", label: "Electricidade", icon: "⚡" },
};

export const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string; border: string }> = {
  critical: { color: "#ff3b5c", bg: "rgba(255,59,92,0.1)", label: "Crítica", border: "rgba(255,59,92,0.25)" },
  warning: { color: "#ffd60a", bg: "rgba(255,214,10,0.1)", label: "Alerta", border: "rgba(255,214,10,0.25)" },
  info: { color: "#00c9a7", bg: "rgba(0,201,167,0.1)", label: "Observação", border: "rgba(0,201,167,0.25)" },
};

export const ACCEPTED_FORMATS = ['pdf'];
export const ZIP_FORMATS = ['zip', 'rar', '7z'];
export const EXTRACTABLE_FORMATS = ['pdf'];
export const FILE_SIZE_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB
