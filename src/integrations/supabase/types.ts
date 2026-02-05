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
      ai_analysis_results: {
        Row: {
          ai_model: string | null
          bounding_box: Json | null
          capture_id: string
          confidence: number
          created_at: string
          description: string | null
          detection_type: Database["public"]["Enums"]["ai_detection_type"]
          id: string
          is_false_positive: boolean | null
          measurements: Json | null
          raw_response: Json | null
          severity: string | null
          site_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_model?: string | null
          bounding_box?: Json | null
          capture_id: string
          confidence: number
          created_at?: string
          description?: string | null
          detection_type: Database["public"]["Enums"]["ai_detection_type"]
          id?: string
          is_false_positive?: boolean | null
          measurements?: Json | null
          raw_response?: Json | null
          severity?: string | null
          site_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_model?: string | null
          bounding_box?: Json | null
          capture_id?: string
          confidence?: number
          created_at?: string
          description?: string | null
          detection_type?: Database["public"]["Enums"]["ai_detection_type"]
          id?: string
          is_false_positive?: boolean | null
          measurements?: Json | null
          raw_response?: Json | null
          severity?: string | null
          site_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_results_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analysis_results_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          site_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          site_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          site_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          mission_created_id: string | null
          report_created_id: string | null
          role: string
          tool_calls: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          mission_created_id?: string | null
          report_created_id?: string | null
          role: string
          tool_calls?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          mission_created_id?: string | null
          report_created_id?: string | null
          role?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_mission_created_id_fkey"
            columns: ["mission_created_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_report_created_id_fkey"
            columns: ["report_created_id"]
            isOneToOne: false
            referencedRelation: "ai_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_reports: {
        Row: {
          content: Json
          created_at: string
          drone_mission_id: string | null
          generated_at: string
          generated_by: string
          id: string
          inspection_id: string | null
          pdf_path: string | null
          period_end: string | null
          period_start: string | null
          report_type: Database["public"]["Enums"]["ai_report_type"]
          site_id: string
          summary: string | null
          title: string
        }
        Insert: {
          content?: Json
          created_at?: string
          drone_mission_id?: string | null
          generated_at?: string
          generated_by: string
          id?: string
          inspection_id?: string | null
          pdf_path?: string | null
          period_end?: string | null
          period_start?: string | null
          report_type: Database["public"]["Enums"]["ai_report_type"]
          site_id: string
          summary?: string | null
          title: string
        }
        Update: {
          content?: Json
          created_at?: string
          drone_mission_id?: string | null
          generated_at?: string
          generated_by?: string
          id?: string
          inspection_id?: string | null
          pdf_path?: string | null
          period_end?: string | null
          period_start?: string | null
          report_type?: Database["public"]["Enums"]["ai_report_type"]
          site_id?: string
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_reports_drone_mission_id_fkey"
            columns: ["drone_mission_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reports_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reports_site_id_fkey"
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
      cameras_360: {
        Row: {
          created_at: string
          id: string
          manufacturer: string | null
          model: string
          name: string
          notes: string | null
          org_id: string
          serial_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manufacturer?: string | null
          model: string
          name: string
          notes?: string | null
          org_id: string
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manufacturer?: string | null
          model?: string
          name?: string
          notes?: string | null
          org_id?: string
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cameras_360_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      capture_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          device_id: string | null
          device_type: string
          drone_mission_id: string | null
          floor_id: string | null
          id: string
          metadata: Json | null
          session_type: string
          site_id: string
          started_at: string
          total_captures: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string
          drone_mission_id?: string | null
          floor_id?: string | null
          id?: string
          metadata?: Json | null
          session_type?: string
          site_id: string
          started_at?: string
          total_captures?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string
          drone_mission_id?: string | null
          floor_id?: string | null
          id?: string
          metadata?: Json | null
          session_type?: string
          site_id?: string
          started_at?: string
          total_captures?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_sessions_drone_mission_id_fkey"
            columns: ["drone_mission_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_sessions_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_sessions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
      drone_missions: {
        Row: {
          ai_command: string | null
          altitude_meters: number | null
          camera_angle_degrees: number | null
          captures_count: number | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          drone_id: string | null
          duration_seconds: number | null
          error_message: string | null
          id: string
          mission_type: Database["public"]["Enums"]["mission_type"]
          name: string
          overlap_percent: number | null
          planned_at: string | null
          site_id: string
          speed_ms: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          total_distance_meters: number | null
          updated_at: string
          waypoints: Json | null
        }
        Insert: {
          ai_command?: string | null
          altitude_meters?: number | null
          camera_angle_degrees?: number | null
          captures_count?: number | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          drone_id?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          mission_type?: Database["public"]["Enums"]["mission_type"]
          name: string
          overlap_percent?: number | null
          planned_at?: string | null
          site_id: string
          speed_ms?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          total_distance_meters?: number | null
          updated_at?: string
          waypoints?: Json | null
        }
        Update: {
          ai_command?: string | null
          altitude_meters?: number | null
          camera_angle_degrees?: number | null
          captures_count?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          drone_id?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          mission_type?: Database["public"]["Enums"]["mission_type"]
          name?: string
          overlap_percent?: number | null
          planned_at?: string | null
          site_id?: string
          speed_ms?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          total_distance_meters?: number | null
          updated_at?: string
          waypoints?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "drone_missions_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_missions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      drones: {
        Row: {
          battery_cycles: number | null
          created_at: string
          firmware_version: string | null
          id: string
          last_flight_at: string | null
          manufacturer: string | null
          model: string
          name: string
          notes: string | null
          org_id: string
          serial_number: string | null
          status: Database["public"]["Enums"]["drone_status"]
          total_flight_hours: number | null
          updated_at: string
        }
        Insert: {
          battery_cycles?: number | null
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_flight_at?: string | null
          manufacturer?: string | null
          model: string
          name: string
          notes?: string | null
          org_id: string
          serial_number?: string | null
          status?: Database["public"]["Enums"]["drone_status"]
          total_flight_hours?: number | null
          updated_at?: string
        }
        Update: {
          battery_cycles?: number | null
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_flight_at?: string | null
          manufacturer?: string | null
          model?: string
          name?: string
          notes?: string | null
          org_id?: string
          serial_number?: string | null
          status?: Database["public"]["Enums"]["drone_status"]
          total_flight_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      project_coordinates: {
        Row: {
          altitude_meters: number | null
          capture_point_id: string | null
          created_at: string
          description: string | null
          flight_altitude_meters: number | null
          heading_degrees: number | null
          id: string
          is_primary: boolean | null
          latitude: number
          longitude: number
          site_id: string
          updated_at: string
        }
        Insert: {
          altitude_meters?: number | null
          capture_point_id?: string | null
          created_at?: string
          description?: string | null
          flight_altitude_meters?: number | null
          heading_degrees?: number | null
          id?: string
          is_primary?: boolean | null
          latitude: number
          longitude: number
          site_id: string
          updated_at?: string
        }
        Update: {
          altitude_meters?: number | null
          capture_point_id?: string | null
          created_at?: string
          description?: string | null
          flight_altitude_meters?: number | null
          heading_degrees?: number | null
          id?: string
          is_primary?: boolean | null
          latitude?: number
          longitude?: number
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_coordinates_capture_point_id_fkey"
            columns: ["capture_point_id"]
            isOneToOne: false
            referencedRelation: "capture_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_coordinates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
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
      ai_detection_type:
        | "fissura"
        | "humidade"
        | "desalinhamento"
        | "medicao"
        | "defeito_estrutural"
        | "corrosao"
        | "infiltracao"
      ai_report_type:
        | "auto_medicao"
        | "ficha_inspecao"
        | "mapa_progresso"
        | "relatorio_semanal"
        | "comparativo_temporal"
      capture_source:
        | "phone_manual"
        | "phone_360"
        | "drone_ortho"
        | "drone_pointcloud"
        | "timelapse"
        | "drone_video"
        | "drone_thermal"
        | "phone_360_auto"
      document_status: "OK" | "MISSING" | "PENDING_REVIEW"
      drone_status: "available" | "in_mission" | "maintenance" | "offline"
      inspection_result: "OK" | "NC" | "OBS" | "NA"
      membership_role: "admin" | "manager" | "viewer"
      mission_status:
        | "draft"
        | "planned"
        | "executing"
        | "completed"
        | "failed"
        | "cancelled"
      mission_type:
        | "medicao"
        | "inspecao_visual"
        | "mapeamento_3d"
        | "timelapse"
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
      ai_detection_type: [
        "fissura",
        "humidade",
        "desalinhamento",
        "medicao",
        "defeito_estrutural",
        "corrosao",
        "infiltracao",
      ],
      ai_report_type: [
        "auto_medicao",
        "ficha_inspecao",
        "mapa_progresso",
        "relatorio_semanal",
        "comparativo_temporal",
      ],
      capture_source: [
        "phone_manual",
        "phone_360",
        "drone_ortho",
        "drone_pointcloud",
        "timelapse",
        "drone_video",
        "drone_thermal",
        "phone_360_auto",
      ],
      document_status: ["OK", "MISSING", "PENDING_REVIEW"],
      drone_status: ["available", "in_mission", "maintenance", "offline"],
      inspection_result: ["OK", "NC", "OBS", "NA"],
      membership_role: ["admin", "manager", "viewer"],
      mission_status: [
        "draft",
        "planned",
        "executing",
        "completed",
        "failed",
        "cancelled",
      ],
      mission_type: [
        "medicao",
        "inspecao_visual",
        "mapeamento_3d",
        "timelapse",
      ],
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
