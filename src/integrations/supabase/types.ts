export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          meta: Json | null
          org_id: string
          site_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          meta?: Json | null
          org_id: string
          site_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          meta?: Json | null
          org_id?: string
          site_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          created_at: string
          floor_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_assets: {
        Row: {
          capture_id: string
          created_at: string
          file_path: string
          id: string
          kind: string
        }
        Insert: {
          capture_id: string
          created_at?: string
          file_path: string
          id?: string
          kind: string
        }
        Update: {
          capture_id?: string
          created_at?: string
          file_path?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_assets_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_points: {
        Row: {
          area_id: string
          code: string
          created_at: string
          description: string | null
          floor_plan_file_id: string | null
          id: string
          marker_code: string | null
          pos_x: number | null
          pos_y: number | null
          updated_at: string
        }
        Insert: {
          area_id: string
          code: string
          created_at?: string
          description?: string | null
          floor_plan_file_id?: string | null
          id?: string
          marker_code?: string | null
          pos_x?: number | null
          pos_y?: number | null
          updated_at?: string
        }
        Update: {
          area_id?: string
          code?: string
          created_at?: string
          description?: string | null
          floor_plan_file_id?: string | null
          id?: string
          marker_code?: string | null
          pos_x?: number | null
          pos_y?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_points_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_points_floor_plan_file_id_fkey"
            columns: ["floor_plan_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
        ]
      }
      captures: {
        Row: {
          capture_point_id: string
          captured_at: string | null
          created_at: string
          duration_seconds: number | null
          file_path: string
          id: string
          mime_type: string | null
          processing_status: Database["public"]["Enums"]["processing_status"]
          size_bytes: number | null
          source_type: Database["public"]["Enums"]["capture_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          capture_point_id: string
          captured_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_path: string
          id?: string
          mime_type?: string | null
          processing_status?: Database["public"]["Enums"]["processing_status"]
          size_bytes?: number | null
          source_type?: Database["public"]["Enums"]["capture_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          capture_point_id?: string
          captured_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_path?: string
          id?: string
          mime_type?: string | null
          processing_status?: Database["public"]["Enums"]["processing_status"]
          size_bytes?: number | null
          source_type?: Database["public"]["Enums"]["capture_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captures_capture_point_id_fkey"
            columns: ["capture_point_id"]
            isOneToOne: false
            referencedRelation: "capture_points"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string | null
          file_path: string
          id: string
          name: string
          org_id: string
          site_id: string
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          file_path: string
          id?: string
          name: string
          org_id: string
          site_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          file_path?: string
          id?: string
          name?: string
          org_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_links: {
        Row: {
          capture_id: string
          created_at: string
          id: string
          inspection_id: string
          kind: string | null
        }
        Insert: {
          capture_id: string
          created_at?: string
          id?: string
          inspection_id: string
          kind?: string | null
        }
        Update: {
          capture_id?: string
          created_at?: string
          id?: string
          inspection_id?: string
          kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_links_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_links_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          created_at: string
          id: string
          level: number | null
          name: string
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: number | null
          name: string
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: number | null
          name?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_documents: {
        Row: {
          document_id: string
          id: string
          inspection_id: string
          notes: string | null
          required: boolean
          status: Database["public"]["Enums"]["document_status"]
        }
        Insert: {
          document_id: string
          id?: string
          inspection_id: string
          notes?: string | null
          required?: boolean
          status?: Database["public"]["Enums"]["document_status"]
        }
        Update: {
          document_id?: string
          id?: string
          inspection_id?: string
          notes?: string | null
          required?: boolean
          status?: Database["public"]["Enums"]["document_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inspection_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_documents_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          inspection_id: string
          notes: string | null
          result: Database["public"]["Enums"]["inspection_result"] | null
          severity: string | null
          template_item_id: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          inspection_id: string
          notes?: string | null
          result?: Database["public"]["Enums"]["inspection_result"] | null
          severity?: string | null
          template_item_id: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          inspection_id?: string
          notes?: string | null
          result?: Database["public"]["Enums"]["inspection_result"] | null
          severity?: string | null
          template_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "inspection_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_template_items: {
        Row: {
          description: string | null
          id: string
          item_code: string
          requires_document: boolean
          requires_evidence: boolean
          section: string | null
          severity_default: string | null
          template_id: string
          title: string
        }
        Insert: {
          description?: string | null
          id?: string
          item_code: string
          requires_document?: boolean
          requires_evidence?: boolean
          section?: string | null
          severity_default?: string | null
          template_id: string
          title: string
        }
        Update: {
          description?: string | null
          id?: string
          item_code?: string
          requires_document?: boolean
          requires_evidence?: boolean
          section?: string | null
          severity_default?: string | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          structure_type: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          structure_type?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          structure_type?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inspection_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          area_id: string | null
          assigned_to: string | null
          capture_point_id: string | null
          created_at: string
          created_by: string
          floor_id: string | null
          id: string
          scheduled_at: string | null
          site_id: string
          status: string
          structure_type: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          assigned_to?: string | null
          capture_point_id?: string | null
          created_at?: string
          created_by: string
          floor_id?: string | null
          id?: string
          scheduled_at?: string | null
          site_id: string
          status?: string
          structure_type?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          assigned_to?: string | null
          capture_point_id?: string | null
          created_at?: string
          created_by?: string
          floor_id?: string | null
          id?: string
          scheduled_at?: string | null
          site_id?: string
          status?: string
          structure_type?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_capture_point_id_fkey"
            columns: ["capture_point_id"]
            isOneToOne: false
            referencedRelation: "capture_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["membership_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nonconformities: {
        Row: {
          corrective_action: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          inspection_id: string
          inspection_item_id: string
          responsible: string | null
          severity: string
          status: Database["public"]["Enums"]["nonconformity_status"]
          title: string
          updated_at: string
        }
        Insert: {
          corrective_action?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          inspection_id: string
          inspection_item_id: string
          responsible?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["nonconformity_status"]
          title: string
          updated_at?: string
        }
        Update: {
          corrective_action?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          inspection_id?: string
          inspection_item_id?: string
          responsible?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["nonconformity_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nonconformities_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nonconformities_inspection_item_id_fkey"
            columns: ["inspection_item_id"]
            isOneToOne: false
            referencedRelation: "inspection_items"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          created_at: string
          file_path: string
          floor_id: string | null
          id: string
          mime_type: string | null
          name: string
          site_id: string
          type: Database["public"]["Enums"]["project_file_type"]
        }
        Insert: {
          created_at?: string
          file_path: string
          floor_id?: string | null
          id?: string
          mime_type?: string | null
          name: string
          site_id: string
          type: Database["public"]["Enums"]["project_file_type"]
        }
        Update: {
          created_at?: string
          file_path?: string
          floor_id?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          site_id?: string
          type?: Database["public"]["Enums"]["project_file_type"]
        }
        Relationships: [
          {
            foreignKeyName: "project_files_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      report_rows: {
        Row: {
          area_name: string | null
          floor_name: string | null
          id: string
          last_capture_at: string | null
          notes: string | null
          point_code: string | null
          report_id: string
          status: string | null
        }
        Insert: {
          area_name?: string | null
          floor_name?: string | null
          id?: string
          last_capture_at?: string | null
          notes?: string | null
          point_code?: string | null
          report_id: string
          status?: string | null
        }
        Update: {
          area_name?: string | null
          floor_name?: string | null
          id?: string
          last_capture_at?: string | null
          notes?: string | null
          point_code?: string | null
          report_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_rows_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          generated_by: string
          id: string
          period_end: string
          period_start: string
          site_id: string
        }
        Insert: {
          created_at?: string
          generated_by: string
          id?: string
          period_end: string
          period_start: string
          site_id: string
        }
        Update: {
          created_at?: string
          generated_by?: string
          id?: string
          period_end?: string
          period_start?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wbs_items: {
        Row: {
          area_id: string | null
          capture_point_id: string | null
          code: string
          created_at: string
          floor_id: string | null
          id: string
          name: string
          planned_end: string | null
          planned_start: string | null
          site_id: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          capture_point_id?: string | null
          code: string
          created_at?: string
          floor_id?: string | null
          id?: string
          name: string
          planned_end?: string | null
          planned_start?: string | null
          site_id: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          capture_point_id?: string | null
          code?: string
          created_at?: string
          floor_id?: string | null
          id?: string
          name?: string
          planned_end?: string | null
          planned_start?: string | null
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wbs_items_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wbs_items_capture_point_id_fkey"
            columns: ["capture_point_id"]
            isOneToOne: false
            referencedRelation: "capture_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wbs_items_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wbs_items_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_site: {
        Args: { _site_id: string; _user_id: string }
        Returns: boolean
      }
      get_org_from_site: { Args: { _site_id: string }; Returns: string }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["membership_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      capture_source:
        | "phone_manual"
        | "phone_360"
        | "drone_ortho"
        | "drone_pointcloud"
        | "timelapse"
      document_status: "OK" | "MISSING" | "PENDING_REVIEW"
      inspection_result: "OK" | "NC" | "OBS" | "NA"
      membership_role: "admin" | "manager" | "viewer"
      nonconformity_status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
      processing_status: "PENDING" | "PROCESSING" | "DONE" | "FAILED"
      project_file_type:
        | "implantacao"
        | "planta_piso"
        | "estrutura"
        | "armadura"
        | "detalhe"
        | "asbuilt"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      capture_source: [
        "phone_manual",
        "phone_360",
        "drone_ortho",
        "drone_pointcloud",
        "timelapse",
      ],
      document_status: ["OK", "MISSING", "PENDING_REVIEW"],
      inspection_result: ["OK", "NC", "OBS", "NA"],
      membership_role: ["admin", "manager", "viewer"],
      nonconformity_status: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
      processing_status: ["PENDING", "PROCESSING", "DONE", "FAILED"],
      project_file_type: [
        "implantacao",
        "planta_piso",
        "estrutura",
        "armadura",
        "detalhe",
        "asbuilt",
      ],
    },
  },
} as const
