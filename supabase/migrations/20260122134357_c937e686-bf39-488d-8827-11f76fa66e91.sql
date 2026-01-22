-- ===================================
-- SitePulse MVP - Complete Database Schema
-- ===================================

-- 1. ENUMS
-- ===================================
CREATE TYPE public.membership_role AS ENUM ('admin', 'manager', 'viewer');
CREATE TYPE public.capture_source AS ENUM ('phone_manual', 'phone_360', 'drone_ortho', 'drone_pointcloud', 'timelapse');
CREATE TYPE public.processing_status AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE public.inspection_result AS ENUM ('OK', 'NC', 'OBS', 'NA');
CREATE TYPE public.nonconformity_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE public.document_status AS ENUM ('OK', 'MISSING', 'PENDING_REVIEW');
CREATE TYPE public.project_file_type AS ENUM ('implantacao', 'planta_piso', 'estrutura', 'armadura', 'detalhe', 'asbuilt');

-- 2. PROFILES TABLE (for user data access)
-- ===================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ORGANIZATIONS (Multi-tenant root)
-- ===================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. MEMBERSHIPS (User-Org relationship with roles)
-- ===================================
CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- 5. SITES (Construction works)
-- ===================================
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. FLOORS
-- ===================================
CREATE TABLE public.floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. AREAS
-- ===================================
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. PROJECT FILES (Plans, blueprints, etc.)
-- ===================================
CREATE TABLE public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES public.floors(id) ON DELETE SET NULL,
  type project_file_type NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. CAPTURE POINTS
-- ===================================
CREATE TABLE public.capture_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  marker_code TEXT,
  floor_plan_file_id UUID REFERENCES public.project_files(id) ON DELETE SET NULL,
  pos_x FLOAT,
  pos_y FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. WBS ITEMS (Work Breakdown Structure)
-- ===================================
CREATE TABLE public.wbs_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  floor_id UUID REFERENCES public.floors(id) ON DELETE SET NULL,
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  capture_point_id UUID REFERENCES public.capture_points(id) ON DELETE SET NULL,
  planned_start DATE,
  planned_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. CAPTURES (Photos/Videos)
-- ===================================
CREATE TABLE public.captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_point_id UUID NOT NULL REFERENCES public.capture_points(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type capture_source NOT NULL DEFAULT 'phone_manual',
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  duration_seconds INT,
  processing_status processing_status NOT NULL DEFAULT 'PENDING',
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. CAPTURE ASSETS (Processed outputs)
-- ===================================
CREATE TABLE public.capture_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID NOT NULL REFERENCES public.captures(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. DOCUMENTS
-- ===================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  doc_type TEXT,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. INSPECTION TEMPLATES
-- ===================================
CREATE TABLE public.inspection_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  structure_type TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. INSPECTION TEMPLATE ITEMS
-- ===================================
CREATE TABLE public.inspection_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.inspection_templates(id) ON DELETE CASCADE,
  section TEXT,
  item_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity_default TEXT,
  requires_evidence BOOLEAN NOT NULL DEFAULT false,
  requires_document BOOLEAN NOT NULL DEFAULT false
);

-- 16. INSPECTIONS
-- ===================================
CREATE TABLE public.inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES public.floors(id) ON DELETE SET NULL,
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  capture_point_id UUID REFERENCES public.capture_points(id) ON DELETE SET NULL,
  template_id UUID NOT NULL REFERENCES public.inspection_templates(id) ON DELETE CASCADE,
  structure_type TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. INSPECTION ITEMS
-- ===================================
CREATE TABLE public.inspection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES public.inspection_template_items(id) ON DELETE CASCADE,
  result inspection_result,
  severity TEXT,
  notes TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. NONCONFORMITIES
-- ===================================
CREATE TABLE public.nonconformities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  inspection_item_id UUID NOT NULL REFERENCES public.inspection_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  corrective_action TEXT,
  responsible TEXT,
  due_date DATE,
  status nonconformity_status NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. INSPECTION DOCUMENTS
-- ===================================
CREATE TABLE public.inspection_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT false,
  status document_status NOT NULL DEFAULT 'PENDING_REVIEW',
  notes TEXT
);

-- 20. EVIDENCE LINKS
-- ===================================
CREATE TABLE public.evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  capture_id UUID NOT NULL REFERENCES public.captures(id) ON DELETE CASCADE,
  kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 21. REPORTS
-- ===================================
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  generated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. REPORT ROWS
-- ===================================
CREATE TABLE public.report_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  floor_name TEXT,
  area_name TEXT,
  point_code TEXT,
  last_capture_at TIMESTAMPTZ,
  status TEXT,
  notes TEXT
);

-- 23. ACTIVITY LOG
-- ===================================
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================================
-- SECURITY DEFINER FUNCTIONS
-- ===================================

-- Check if user is member of organization
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id AND org_id = _org_id
  )
$$;

-- Check if user has specific role in organization
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _role membership_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id AND org_id = _org_id AND role = _role
  )
$$;

-- Get org_id from site_id
CREATE OR REPLACE FUNCTION public.get_org_from_site(_site_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.sites WHERE id = _site_id
$$;

-- Check if user can access site
CREATE OR REPLACE FUNCTION public.can_access_site(_user_id UUID, _site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_member(_user_id, public.get_org_from_site(_site_id))
$$;

-- ===================================
-- ENABLE RLS ON ALL TABLES
-- ===================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wbs_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nonconformities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- ===================================
-- RLS POLICIES
-- ===================================

-- PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ORGANIZATIONS
CREATE POLICY "Members can view their organizations" ON public.organizations
  FOR SELECT USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Authenticated users can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update organizations" ON public.organizations
  FOR UPDATE USING (public.has_org_role(auth.uid(), id, 'admin'));
CREATE POLICY "Admins can delete organizations" ON public.organizations
  FOR DELETE USING (public.has_org_role(auth.uid(), id, 'admin'));

-- MEMBERSHIPS
CREATE POLICY "Members can view memberships in their orgs" ON public.memberships
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can insert memberships" ON public.memberships
  FOR INSERT WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin') OR NOT EXISTS (SELECT 1 FROM public.memberships WHERE org_id = memberships.org_id));
CREATE POLICY "Admins can update memberships" ON public.memberships
  FOR UPDATE USING (public.has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can delete memberships" ON public.memberships
  FOR DELETE USING (public.has_org_role(auth.uid(), org_id, 'admin'));

-- SITES
CREATE POLICY "Members can view sites" ON public.sites
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admin/Manager can create sites" ON public.sites
  FOR INSERT WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin') OR public.has_org_role(auth.uid(), org_id, 'manager'));
CREATE POLICY "Admin/Manager can update sites" ON public.sites
  FOR UPDATE USING (public.has_org_role(auth.uid(), org_id, 'admin') OR public.has_org_role(auth.uid(), org_id, 'manager'));
CREATE POLICY "Admins can delete sites" ON public.sites
  FOR DELETE USING (public.has_org_role(auth.uid(), org_id, 'admin'));

-- FLOORS (access via site)
CREATE POLICY "Members can view floors" ON public.floors
  FOR SELECT USING (public.can_access_site(auth.uid(), site_id));
CREATE POLICY "Admin/Manager can manage floors" ON public.floors
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sites s 
      WHERE s.id = site_id 
      AND (public.has_org_role(auth.uid(), s.org_id, 'admin') OR public.has_org_role(auth.uid(), s.org_id, 'manager'))
    )
  );

-- AREAS (access via floor->site)
CREATE POLICY "Members can view areas" ON public.areas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.floors f 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE f.id = floor_id AND public.is_org_member(auth.uid(), s.org_id)
    )
  );
CREATE POLICY "Admin/Manager can manage areas" ON public.areas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.floors f 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE f.id = floor_id 
      AND (public.has_org_role(auth.uid(), s.org_id, 'admin') OR public.has_org_role(auth.uid(), s.org_id, 'manager'))
    )
  );

-- PROJECT FILES
CREATE POLICY "Members can view project files" ON public.project_files
  FOR SELECT USING (public.can_access_site(auth.uid(), site_id));
CREATE POLICY "Admin/Manager can manage project files" ON public.project_files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sites s 
      WHERE s.id = site_id 
      AND (public.has_org_role(auth.uid(), s.org_id, 'admin') OR public.has_org_role(auth.uid(), s.org_id, 'manager'))
    )
  );

-- CAPTURE POINTS
CREATE POLICY "Members can view capture points" ON public.capture_points
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.areas a 
      JOIN public.floors f ON f.id = a.floor_id 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE a.id = area_id AND public.is_org_member(auth.uid(), s.org_id)
    )
  );
CREATE POLICY "Members can manage capture points" ON public.capture_points
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.areas a 
      JOIN public.floors f ON f.id = a.floor_id 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE a.id = area_id AND public.is_org_member(auth.uid(), s.org_id)
    )
  );

-- WBS ITEMS
CREATE POLICY "Members can view wbs items" ON public.wbs_items
  FOR SELECT USING (public.can_access_site(auth.uid(), site_id));
CREATE POLICY "Admin/Manager can manage wbs items" ON public.wbs_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sites s 
      WHERE s.id = site_id 
      AND (public.has_org_role(auth.uid(), s.org_id, 'admin') OR public.has_org_role(auth.uid(), s.org_id, 'manager'))
    )
  );

-- CAPTURES
CREATE POLICY "Members can view captures" ON public.captures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.capture_points cp 
      JOIN public.areas a ON a.id = cp.area_id 
      JOIN public.floors f ON f.id = a.floor_id 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE cp.id = capture_point_id AND public.is_org_member(auth.uid(), s.org_id)
    )
  );
CREATE POLICY "Members can create captures" ON public.captures
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.capture_points cp 
      JOIN public.areas a ON a.id = cp.area_id 
      JOIN public.floors f ON f.id = a.floor_id 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE cp.id = capture_point_id AND public.is_org_member(auth.uid(), s.org_id)
    )
  );
CREATE POLICY "Users can update own captures" ON public.captures
  FOR UPDATE USING (auth.uid() = user_id);

-- CAPTURE ASSETS
CREATE POLICY "Members can view capture assets" ON public.capture_assets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.captures c 
      JOIN public.capture_points cp ON cp.id = c.capture_point_id 
      JOIN public.areas a ON a.id = cp.area_id 
      JOIN public.floors f ON f.id = a.floor_id 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE c.id = capture_id AND public.is_org_member(auth.uid(), s.org_id)
    )
  );

-- DOCUMENTS
CREATE POLICY "Members can view documents" ON public.documents
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can create documents" ON public.documents
  FOR INSERT WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admin/Manager can manage documents" ON public.documents
  FOR ALL USING (public.has_org_role(auth.uid(), org_id, 'admin') OR public.has_org_role(auth.uid(), org_id, 'manager'));

-- INSPECTION TEMPLATES
CREATE POLICY "Members can view templates" ON public.inspection_templates
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage templates" ON public.inspection_templates
  FOR ALL USING (public.has_org_role(auth.uid(), org_id, 'admin'));

-- INSPECTION TEMPLATE ITEMS
CREATE POLICY "Members can view template items" ON public.inspection_template_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspection_templates t 
      WHERE t.id = template_id AND public.is_org_member(auth.uid(), t.org_id)
    )
  );
CREATE POLICY "Admins can manage template items" ON public.inspection_template_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inspection_templates t 
      WHERE t.id = template_id AND public.has_org_role(auth.uid(), t.org_id, 'admin')
    )
  );

-- INSPECTIONS
CREATE POLICY "Members can view inspections" ON public.inspections
  FOR SELECT USING (public.can_access_site(auth.uid(), site_id));
CREATE POLICY "Members can create inspections" ON public.inspections
  FOR INSERT WITH CHECK (auth.uid() = created_by AND public.can_access_site(auth.uid(), site_id));
CREATE POLICY "Members can update inspections" ON public.inspections
  FOR UPDATE USING (public.can_access_site(auth.uid(), site_id));

-- INSPECTION ITEMS
CREATE POLICY "Members can view inspection items" ON public.inspection_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );
CREATE POLICY "Members can manage inspection items" ON public.inspection_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

-- NONCONFORMITIES
CREATE POLICY "Members can view nonconformities" ON public.nonconformities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );
CREATE POLICY "Members can manage nonconformities" ON public.nonconformities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

-- INSPECTION DOCUMENTS
CREATE POLICY "Members can view inspection documents" ON public.inspection_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );
CREATE POLICY "Members can manage inspection documents" ON public.inspection_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

-- EVIDENCE LINKS
CREATE POLICY "Members can view evidence links" ON public.evidence_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );
CREATE POLICY "Members can manage evidence links" ON public.evidence_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

-- REPORTS
CREATE POLICY "Members can view reports" ON public.reports
  FOR SELECT USING (public.can_access_site(auth.uid(), site_id));
CREATE POLICY "Members can create reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = generated_by AND public.can_access_site(auth.uid(), site_id));

-- REPORT ROWS
CREATE POLICY "Members can view report rows" ON public.report_rows
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reports r 
      WHERE r.id = report_id AND public.can_access_site(auth.uid(), r.site_id)
    )
  );
CREATE POLICY "Members can manage report rows" ON public.report_rows
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.reports r 
      WHERE r.id = report_id AND public.can_access_site(auth.uid(), r.site_id)
    )
  );

-- ACTIVITY LOG
CREATE POLICY "Members can view activity log" ON public.activity_log
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can create activity log" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_org_member(auth.uid(), org_id));

-- ===================================
-- TRIGGERS
-- ===================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_floors_updated_at BEFORE UPDATE ON public.floors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_capture_points_updated_at BEFORE UPDATE ON public.capture_points FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wbs_items_updated_at BEFORE UPDATE ON public.wbs_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_captures_updated_at BEFORE UPDATE ON public.captures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inspections_updated_at BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_nonconformities_updated_at BEFORE UPDATE ON public.nonconformities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===================================
-- STORAGE BUCKET
-- ===================================
INSERT INTO storage.buckets (id, name, public) VALUES ('captures', 'captures', false);

-- Storage policies for captures bucket
CREATE POLICY "Authenticated users can upload captures" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'captures' AND auth.uid() IS NOT NULL);

CREATE POLICY "Members can view captures in their orgs" ON storage.objects
  FOR SELECT USING (bucket_id = 'captures' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own captures" ON storage.objects
  FOR UPDATE USING (bucket_id = 'captures' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own captures" ON storage.objects
  FOR DELETE USING (bucket_id = 'captures' AND auth.uid() IS NOT NULL);