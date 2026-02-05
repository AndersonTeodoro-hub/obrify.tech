import type { Database } from '@/integrations/supabase/types';
import type { ExifData } from '@/lib/exif-parser';

export type CaptureSource = Database['public']['Enums']['capture_source'];
export type ProcessingStatus = Database['public']['Enums']['processing_status'];

// File upload types
export interface FileWithPreview {
  id: string;
  file: File;
  preview: string;
  exifData: ExifData | null;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export interface CaptureWithDetails {
  id: string;
  file_path: string;
  source_type: CaptureSource;
  processing_status: ProcessingStatus;
  captured_at: string | null;
  created_at: string;
  user_id: string;
  capture_point: {
    id: string;
    code: string;
    description: string | null;
    area: {
      id: string;
      name: string;
      floor: {
        id: string;
        name: string;
        level: number | null;
        site: {
          id: string;
          name: string;
        };
      };
    };
  };
  profile: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface CaptureFiltersState {
  siteId: string | null;
  floorId: string | null;
  captureType: 'all' | 'photo' | 'video' | 'panorama';
  dateFrom: Date | null;
  dateTo: Date | null;
}

export type CaptureCategory = 'photo' | 'video' | 'panorama';

export const SOURCE_TO_CATEGORY: Record<CaptureSource, CaptureCategory> = {
  phone_manual: 'photo',
  phone_360: 'panorama',
  phone_360_auto: 'panorama',
  drone_ortho: 'photo',
  drone_pointcloud: 'photo',
  drone_video: 'video',
  drone_thermal: 'photo',
  timelapse: 'video',
};

export const CATEGORY_SOURCES: Record<CaptureCategory, CaptureSource[]> = {
  photo: ['phone_manual', 'drone_ortho', 'drone_pointcloud', 'drone_thermal'],
  video: ['drone_video', 'timelapse'],
  panorama: ['phone_360', 'phone_360_auto'],
};

// AI Analysis types
export interface AIDetection {
  type: string;
  description: string;
  severity: 'critical' | 'major' | 'minor' | 'observation';
  location: string;
  confidence: number;
  measurements?: {
    estimated_width_mm?: number;
    estimated_length_cm?: number;
    estimated_spacing_cm?: number;
  };
}

export interface AIAnalysisResult {
  success: boolean;
  capture_id: string;
  analysis_type: 'defects' | 'rebar' | 'general';
  detections: AIDetection[];
  overall_assessment: string;
  recommendations: string[];
  results_saved: number;
}
