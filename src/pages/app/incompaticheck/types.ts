export interface Obra {
  id: string;
  user_id: string;
  nome: string;
  cidade: string;
  fiscal: string;
  analysis_context: string | null;
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

// ---- PDE / Desenhos de Preparação ----

export type PdeDocType = 'pde' | 'desenho_preparacao' | 'resposta_pde';

export interface PdeDocument {
  id: string;
  user_id: string;
  obra_id: string;
  doc_type: PdeDocType;
  file_name: string;
  file_path: string;
  file_size: number;
  created_at: string;
}

export interface PdeAnalysis {
  id: string;
  user_id: string;
  obra_id: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  verdict: 'approved' | 'approved_with_reservations' | 'rejected' | null;
  ai_analysis: {
    summary: string;
    findings_addressed: Array<{
      finding_title: string;
      resolved: boolean;
      comment: string;
    }>;
    new_issues: Array<{
      severity: string;
      title: string;
      description: string;
      location: string;
    }>;
    technical_notes: string[];
    recommendation: string;
  } | null;
  pde_document_ids: string[];
  desenho_document_ids: string[];
  created_at: string;
  completed_at: string | null;
}

export const PDE_DOC_TYPES: Record<PdeDocType, { label: string; icon: string; color: string; description: string }> = {
  pde: { label: 'PDE', icon: '📄', color: '#3b82f6', description: 'Pedido de Esclarecimento do empreiteiro' },
  desenho_preparacao: { label: 'Desenho de Preparação', icon: '📐', color: '#8b5cf6', description: 'Proposta de solução do empreiteiro' },
  resposta_pde: { label: 'Resposta ao PDE', icon: '💬', color: '#10b981', description: 'Resposta do projetista' },
};

export const VERDICT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  approved: { label: 'Aprovado', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: '✅' },
  approved_with_reservations: { label: 'Aprovado c/ Reservas', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '⚠️' },
  rejected: { label: 'Rejeitado', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: '❌' },
};

// ---- ONDA 1: Inventario (Estagio 0) e Elementos (Estagio 1) ----

export type ProcessingStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR';

export interface InventoryRow {
  id: string;
  user_id: string;
  obra_id: string;
  project_id: string;
  especialidade: string;
  doc_type: string;
  pisos: string[];
  zonas: string[];
  sistema_eixos: string | null;
  escala: string | null;
  num_paginas: number | null;
  summary: string | null;
  confidence: number | null;
  processing_status: ProcessingStatus;
  error_message: string | null;
  created_at: string;
  analyzed_at: string | null;
}

export interface ElementRow {
  id: string;
  user_id: string;
  obra_id: string;
  project_id: string;
  inventory_id: string | null;
  especialidade: string;
  element_type: string;
  element_ref: string | null;
  piso: string | null;
  cota_base: number | null;
  cota_topo: number | null;
  cota_raw: string | null;
  eixo_ref: string | null;
  dimensions: Record<string, number> | null;
  material: string | null;
  route: Array<{ de?: string; para?: string; piso?: string; cota?: number }> | null;
  source_page: number;
  source_zone: string | null;
  raw_evidence: string;
  confidence: number;
  created_at: string;
}

// ---- ONDA 2: Cruzamento por pares (Estagio 2) ----

export interface CrossFinding {
  id: string;
  user_id: string;
  obra_id: string;
  run_id: string | null;
  especialidade_a: string;
  especialidade_b: string;
  tipo_conflito: string;
  severity: 'alta' | 'media' | 'baixa';
  title: string;
  description: string;
  impact: string | null;
  location: string | null;
  recommendation: string | null;
  constructability_note: string | null;
  element_a_id: string;
  element_b_id: string | null;
  confidence: number;
  status: 'novo' | 'confirmado' | 'rejeitado';
  created_at: string;
}

// ---- ONDA 2.5: Analise isolada (coerencia interna) ----

export interface SelfFinding {
  id: string;
  user_id: string;
  obra_id: string;
  project_id: string;
  run_id: string | null;
  especialidade: string;
  tipo_problema: string;
  severity: 'alta' | 'media' | 'baixa';
  title: string;
  description: string;
  impact: string | null;
  location: string | null;
  recommendation: string | null;
  element_a_id: string;
  element_b_id: string | null;
  confidence: number;
  status: 'novo' | 'confirmado' | 'rejeitado';
  created_at: string;
}
