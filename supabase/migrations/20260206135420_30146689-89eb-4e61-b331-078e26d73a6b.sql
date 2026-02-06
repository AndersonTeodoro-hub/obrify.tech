
-- Enums
CREATE TYPE public.project_specialty AS ENUM ('topography', 'architecture', 'structure', 'plumbing', 'electrical', 'hvac', 'gas', 'telecom', 'other');
CREATE TYPE public.project_analysis_status AS ENUM ('pending', 'analyzing', 'completed', 'failed');
CREATE TYPE public.conflict_type AS ENUM ('spatial_overlap', 'dimension_mismatch', 'missing_provision', 'code_violation');
CREATE TYPE public.conflict_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public.conflict_status AS ENUM ('detected', 'confirmed', 'dismissed', 'resolved', 'nc_created');

-- Table: projects
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  site_id UUID NOT NULL REFERENCES public.sites(id),
  specialty public.project_specialty NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  floor_or_zone TEXT,
  version TEXT,
  is_current_version BOOLEAN NOT NULL DEFAULT true,
  file_url TEXT,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at TIMESTAMPTZ,
  analysis_status public.project_analysis_status NOT NULL DEFAULT 'pending'
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view projects" ON public.projects
  FOR SELECT USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Members can insert projects" ON public.projects
  FOR INSERT WITH CHECK (is_org_member(auth.uid(), organization_id) AND auth.uid() = uploaded_by);

CREATE POLICY "Members can update projects" ON public.projects
  FOR UPDATE USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Manager can delete projects" ON public.projects
  FOR DELETE USING (has_org_role(auth.uid(), organization_id, 'admin'::membership_role) OR has_org_role(auth.uid(), organization_id, 'manager'::membership_role));

-- Table: project_elements
CREATE TABLE public.project_elements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  element_type TEXT NOT NULL,
  element_code TEXT,
  location_description TEXT,
  properties JSONB NOT NULL DEFAULT '{}',
  confidence DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view project elements" ON public.project_elements
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_elements.project_id AND is_org_member(auth.uid(), p.organization_id)
  ));

CREATE POLICY "Admin/Manager can manage project elements" ON public.project_elements
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_elements.project_id
    AND (has_org_role(auth.uid(), p.organization_id, 'admin'::membership_role) OR has_org_role(auth.uid(), p.organization_id, 'manager'::membership_role))
  ));

-- Table: project_conflicts
CREATE TABLE public.project_conflicts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  site_id UUID NOT NULL REFERENCES public.sites(id),
  project1_id UUID NOT NULL REFERENCES public.projects(id),
  project2_id UUID NOT NULL REFERENCES public.projects(id),
  conflict_type public.conflict_type NOT NULL,
  severity public.conflict_severity NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location_description TEXT,
  ai_confidence DOUBLE PRECISION,
  status public.conflict_status NOT NULL DEFAULT 'detected',
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  related_nc_id UUID REFERENCES public.nonconformities(id),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view project conflicts" ON public.project_conflicts
  FOR SELECT USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Manager/Inspector can insert conflicts" ON public.project_conflicts
  FOR INSERT WITH CHECK (has_any_org_role(auth.uid(), organization_id, ARRAY['admin'::membership_role, 'manager'::membership_role, 'inspector'::membership_role]));

CREATE POLICY "Admin/Manager/Inspector can update conflicts" ON public.project_conflicts
  FOR UPDATE USING (has_any_org_role(auth.uid(), organization_id, ARRAY['admin'::membership_role, 'manager'::membership_role, 'inspector'::membership_role]));

-- Indexes
CREATE INDEX idx_projects_site_specialty ON public.projects(site_id, specialty);
CREATE INDEX idx_projects_org ON public.projects(organization_id);
CREATE INDEX idx_project_elements_project ON public.project_elements(project_id);
CREATE INDEX idx_project_conflicts_site ON public.project_conflicts(site_id);
CREATE INDEX idx_project_conflicts_status ON public.project_conflicts(status);
