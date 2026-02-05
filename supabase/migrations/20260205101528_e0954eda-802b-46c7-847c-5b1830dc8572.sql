-- =============================================
-- FASE 1: Infraestrutura de Dados para Drone + IA
-- =============================================

-- 1. Criar novos ENUMs
CREATE TYPE public.mission_type AS ENUM (
  'medicao',
  'inspecao_visual', 
  'mapeamento_3d',
  'timelapse'
);

CREATE TYPE public.mission_status AS ENUM (
  'draft',
  'planned',
  'executing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE public.ai_detection_type AS ENUM (
  'fissura',
  'humidade',
  'desalinhamento',
  'medicao',
  'defeito_estrutural',
  'corrosao',
  'infiltracao'
);

CREATE TYPE public.drone_status AS ENUM (
  'available',
  'in_mission',
  'maintenance',
  'offline'
);

CREATE TYPE public.ai_report_type AS ENUM (
  'auto_medicao',
  'ficha_inspecao',
  'mapa_progresso',
  'relatorio_semanal',
  'comparativo_temporal'
);

-- 2. Tabela de coordenadas GPS do projeto
CREATE TABLE public.project_coordinates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_point_id UUID REFERENCES public.capture_points(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude_meters DOUBLE PRECISION DEFAULT 0,
  flight_altitude_meters DOUBLE PRECISION DEFAULT 30,
  heading_degrees DOUBLE PRECISION DEFAULT 0,
  description TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de drones registados
CREATE TABLE public.drones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  manufacturer TEXT DEFAULT 'DJI',
  serial_number TEXT,
  status public.drone_status NOT NULL DEFAULT 'available',
  last_flight_at TIMESTAMPTZ,
  total_flight_hours NUMERIC(10,2) DEFAULT 0,
  battery_cycles INTEGER DEFAULT 0,
  firmware_version TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de câmeras 360
CREATE TABLE public.cameras_360 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  manufacturer TEXT DEFAULT 'Insta360',
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabela de missões de drone
CREATE TABLE public.drone_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  drone_id UUID REFERENCES public.drones(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  mission_type public.mission_type NOT NULL DEFAULT 'inspecao_visual',
  status public.mission_status NOT NULL DEFAULT 'draft',
  waypoints JSONB DEFAULT '[]'::jsonb,
  altitude_meters DOUBLE PRECISION DEFAULT 30,
  overlap_percent INTEGER DEFAULT 75,
  speed_ms DOUBLE PRECISION DEFAULT 5,
  camera_angle_degrees DOUBLE PRECISION DEFAULT -90,
  ai_command TEXT,
  planned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  total_distance_meters DOUBLE PRECISION,
  captures_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabela de sessões de captura
CREATE TABLE public.capture_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES public.floors(id) ON DELETE SET NULL,
  drone_mission_id UUID REFERENCES public.drone_missions(id) ON DELETE SET NULL,
  session_type TEXT NOT NULL DEFAULT 'manual',
  device_type TEXT NOT NULL DEFAULT 'phone',
  device_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_captures INTEGER DEFAULT 0,
  user_id UUID NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Tabela de resultados de análise IA
CREATE TABLE public.ai_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID NOT NULL REFERENCES public.captures(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  detection_type public.ai_detection_type NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  severity TEXT DEFAULT 'medium',
  bounding_box JSONB,
  measurements JSONB,
  description TEXT,
  ai_model TEXT,
  raw_response JSONB,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  is_false_positive BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Tabela de relatórios gerados pela IA
CREATE TABLE public.ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
  drone_mission_id UUID REFERENCES public.drone_missions(id) ON DELETE SET NULL,
  report_type public.ai_report_type NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  pdf_path TEXT,
  period_start DATE,
  period_end DATE,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Tabela de conversações com o agente IA
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Tabela de mensagens do agente IA
CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  mission_created_id UUID REFERENCES public.drone_missions(id),
  report_created_id UUID REFERENCES public.ai_reports(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- TRIGGERS para updated_at
-- =============================================

CREATE TRIGGER update_project_coordinates_updated_at
  BEFORE UPDATE ON public.project_coordinates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_drones_updated_at
  BEFORE UPDATE ON public.drones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cameras_360_updated_at
  BEFORE UPDATE ON public.cameras_360
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_drone_missions_updated_at
  BEFORE UPDATE ON public.drone_missions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- project_coordinates
ALTER TABLE public.project_coordinates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view project coordinates"
  ON public.project_coordinates FOR SELECT
  USING (can_access_site(auth.uid(), site_id));

CREATE POLICY "Admin/Manager can manage project coordinates"
  ON public.project_coordinates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = project_coordinates.site_id
      AND (has_org_role(auth.uid(), s.org_id, 'admin') OR has_org_role(auth.uid(), s.org_id, 'manager'))
    )
  );

-- drones
ALTER TABLE public.drones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view drones"
  ON public.drones FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admin/Manager can manage drones"
  ON public.drones FOR ALL
  USING (has_org_role(auth.uid(), org_id, 'admin') OR has_org_role(auth.uid(), org_id, 'manager'));

-- cameras_360
ALTER TABLE public.cameras_360 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view cameras"
  ON public.cameras_360 FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admin/Manager can manage cameras"
  ON public.cameras_360 FOR ALL
  USING (has_org_role(auth.uid(), org_id, 'admin') OR has_org_role(auth.uid(), org_id, 'manager'));

-- drone_missions
ALTER TABLE public.drone_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view drone missions"
  ON public.drone_missions FOR SELECT
  USING (can_access_site(auth.uid(), site_id));

CREATE POLICY "Members can create drone missions"
  ON public.drone_missions FOR INSERT
  WITH CHECK (auth.uid() = created_by AND can_access_site(auth.uid(), site_id));

CREATE POLICY "Members can update drone missions"
  ON public.drone_missions FOR UPDATE
  USING (can_access_site(auth.uid(), site_id));

-- capture_sessions
ALTER TABLE public.capture_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view capture sessions"
  ON public.capture_sessions FOR SELECT
  USING (can_access_site(auth.uid(), site_id));

CREATE POLICY "Members can create capture sessions"
  ON public.capture_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id AND can_access_site(auth.uid(), site_id));

CREATE POLICY "Members can update own capture sessions"
  ON public.capture_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- ai_analysis_results
ALTER TABLE public.ai_analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view AI analysis results"
  ON public.ai_analysis_results FOR SELECT
  USING (can_access_site(auth.uid(), site_id));

CREATE POLICY "System can insert AI analysis results"
  ON public.ai_analysis_results FOR INSERT
  WITH CHECK (can_access_site(auth.uid(), site_id));

CREATE POLICY "Members can update AI analysis results"
  ON public.ai_analysis_results FOR UPDATE
  USING (can_access_site(auth.uid(), site_id));

-- ai_reports
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view AI reports"
  ON public.ai_reports FOR SELECT
  USING (can_access_site(auth.uid(), site_id));

CREATE POLICY "Members can create AI reports"
  ON public.ai_reports FOR INSERT
  WITH CHECK (auth.uid() = generated_by AND can_access_site(auth.uid(), site_id));

-- ai_conversations
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON public.ai_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON public.ai_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON public.ai_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON public.ai_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- ai_messages
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in own conversations"
  ON public.ai_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in own conversations"
  ON public.ai_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
    )
  );

-- =============================================
-- INDEXES para performance
-- =============================================

CREATE INDEX idx_project_coordinates_site ON public.project_coordinates(site_id);
CREATE INDEX idx_project_coordinates_capture_point ON public.project_coordinates(capture_point_id);
CREATE INDEX idx_drones_org ON public.drones(org_id);
CREATE INDEX idx_drones_status ON public.drones(status);
CREATE INDEX idx_drone_missions_site ON public.drone_missions(site_id);
CREATE INDEX idx_drone_missions_status ON public.drone_missions(status);
CREATE INDEX idx_drone_missions_drone ON public.drone_missions(drone_id);
CREATE INDEX idx_capture_sessions_site ON public.capture_sessions(site_id);
CREATE INDEX idx_ai_analysis_capture ON public.ai_analysis_results(capture_id);
CREATE INDEX idx_ai_analysis_site ON public.ai_analysis_results(site_id);
CREATE INDEX idx_ai_analysis_type ON public.ai_analysis_results(detection_type);
CREATE INDEX idx_ai_reports_site ON public.ai_reports(site_id);
CREATE INDEX idx_ai_reports_type ON public.ai_reports(report_type);
CREATE INDEX idx_ai_conversations_user ON public.ai_conversations(user_id);
CREATE INDEX idx_ai_messages_conversation ON public.ai_messages(conversation_id);

-- =============================================
-- Adicionar novos valores ao enum capture_source existente
-- =============================================

ALTER TYPE public.capture_source ADD VALUE IF NOT EXISTS 'drone_video';
ALTER TYPE public.capture_source ADD VALUE IF NOT EXISTS 'drone_thermal';
ALTER TYPE public.capture_source ADD VALUE IF NOT EXISTS 'phone_360_auto';