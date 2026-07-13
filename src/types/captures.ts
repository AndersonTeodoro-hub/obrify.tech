import type { Database } from '@/integrations/supabase/types';
import type { ExifData } from '@/lib/exif-parser';

export type CaptureSource = Database['public']['Enums']['capture_source'];
export type ProcessingStatus = Database['public']['Enums']['processing_status'];

// Snapshot do contexto no MOMENTO do disparo (ligado a cada foto, não ao lote).
export interface CaptureFileMeta {
  especialidade: string | null;
  fase: string | null;
  nivelId: string | null;
  piso: string | null;
  cota: number | null;
  ambiente: string | null;
  atividade: string | null;
  label: string;
  contextId: string | null;
}

// File upload types
export interface FileWithPreview {
  id: string;
  file: File;
  preview: string;
  exifData: ExifData | null;
  status: 'pending' | 'compressing' | 'uploading' | 'success' | 'error';
  progress: number;
  statusText?: string;
  error?: string;
  // Contexto capturado no disparo desta foto (fase/piso/etc.) — não do submit.
  meta?: CaptureFileMeta;
}

export interface CaptureWithDetails {
  id: string;
  file_path: string;
  source_type: CaptureSource;
  processing_status: ProcessingStatus;
  captured_at: string | null;
  created_at: string;
  user_id: string;
  // Localização directa (novo modelo por site_id)
  site: { id: string; name: string } | null;
  fase: string | null;
  especialidade: string | null;
  nivel: { id: string; piso: string | null; cota: number | null } | null;
  notes: string | null;
  // Localização legada via ponto de captura (pode ser null no novo modelo)
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
  } | null;
  profile: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

// Rótulos de localização tolerantes a capture_point nulo (novo modelo por site_id).
export function captureTitle(c: CaptureWithDetails): string {
  return c.capture_point?.code ?? c.nivel?.piso ?? c.site?.name ?? 'Captura';
}

export function captureLocationLabel(c: CaptureWithDetails): string {
  if (c.capture_point) {
    const f = c.capture_point.area.floor;
    return `${f.site.name} • ${f.name} • ${c.capture_point.area.name}`;
  }
  const nivelLabel = c.nivel
    ? `${c.nivel.piso ?? ''}${c.nivel.cota != null ? ` (${c.nivel.cota})` : ''}`.trim()
    : '';
  const parts = [c.site?.name, c.especialidade, nivelLabel].filter(Boolean);
  return parts.join(' • ') || '—';
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
