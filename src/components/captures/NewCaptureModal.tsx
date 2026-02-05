import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Image, Video, View, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { CaptureCategory, CaptureSource } from '@/types/captures';

interface NewCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_TO_SOURCE: Record<CaptureCategory, CaptureSource> = {
  photo: 'phone_manual',
  video: 'drone_video',
  panorama: 'phone_360',
};

export function NewCaptureModal({ open, onOpenChange }: NewCaptureModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedSite, setSelectedSite] = useState<string>('');
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [selectedPoint, setSelectedPoint] = useState<string>('');
  const [captureType, setCaptureType] = useState<CaptureCategory>('photo');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Fetch user's organizations and sites
  const { data: sites = [] } = useQuery({
    queryKey: ['user-sites', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data: memberships } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id);

      if (!memberships?.length) return [];

      const orgIds = memberships.map((m) => m.org_id);
      
      const { data: sites } = await supabase
        .from('sites')
        .select('id, name')
        .in('org_id', orgIds)
        .order('name');

      return sites || [];
    },
    enabled: !!user && open,
  });

  // Fetch floors for selected site
  const { data: floors = [], isLoading: isLoadingFloors } = useQuery({
    queryKey: ['site-floors', selectedSite],
    queryFn: async () => {
      if (!selectedSite) return [];
      
      const { data } = await supabase
        .from('floors')
        .select('id, name, level')
        .eq('site_id', selectedSite)
        .order('level');

      return data || [];
    },
    enabled: !!selectedSite,
  });

  // Fetch areas for selected floor
  const { data: areas = [], isLoading: isLoadingAreas } = useQuery({
    queryKey: ['floor-areas', selectedFloor],
    queryFn: async () => {
      if (!selectedFloor) return [];
      
      const { data } = await supabase
        .from('areas')
        .select('id, name')
        .eq('floor_id', selectedFloor)
        .order('name');

      return data || [];
    },
    enabled: !!selectedFloor,
  });

  // Fetch capture points for selected area
  const { data: capturePoints = [], isLoading: isLoadingPoints } = useQuery({
    queryKey: ['area-capture-points', selectedArea],
    queryFn: async () => {
      if (!selectedArea) return [];
      
      const { data } = await supabase
        .from('capture_points')
        .select('id, code, description')
        .eq('area_id', selectedArea)
        .order('code');

      return data || [];
    },
    enabled: !!selectedArea,
  });

  const createCaptureMutation = useMutation({
    mutationFn: async () => {
      if (!user || !selectedPoint) throw new Error('Missing required fields');

      // For now, just create a placeholder file path since storage isn't configured yet
      const filePath = `captures/${selectedPoint}/${Date.now()}_${file?.name || 'capture'}`;

      const { error } = await supabase.from('captures').insert({
        capture_point_id: selectedPoint,
        user_id: user.id,
        file_path: filePath,
        source_type: CATEGORY_TO_SOURCE[captureType],
        processing_status: 'PENDING',
        captured_at: new Date().toISOString(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('captures.uploadSuccess'));
      queryClient.invalidateQueries({ queryKey: ['captures'] });
      handleClose();
    },
    onError: (error) => {
      toast.error(t('common.error'), {
        description: error.message,
      });
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      // Create preview for images and videos
      if (selectedFile.type.startsWith('image/') || selectedFile.type.startsWith('video/')) {
        const url = URL.createObjectURL(selectedFile);
        setPreview(url);
      }
    }
  }, []);

  const handleClose = () => {
    setSelectedSite('');
    setSelectedFloor('');
    setSelectedArea('');
    setSelectedPoint('');
    setCaptureType('photo');
    setNotes('');
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    createCaptureMutation.mutate();
  };

  const isValid = selectedPoint && file;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('captures.new')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Site selection */}
          <div className="space-y-2">
            <Label>{t('captures.selectSite')}</Label>
            <Select value={selectedSite} onValueChange={(v) => {
              setSelectedSite(v);
              setSelectedFloor('');
              setSelectedArea('');
              setSelectedPoint('');
            }}>
              <SelectTrigger>
                <SelectValue placeholder={t('captures.selectSite')} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Floor selection */}
          {selectedSite && (
            <div className="space-y-2">
              <Label>{t('captures.selectFloor')}</Label>
              <Select 
                value={selectedFloor} 
                onValueChange={(v) => {
                  setSelectedFloor(v);
                  setSelectedArea('');
                  setSelectedPoint('');
                }}
                disabled={isLoadingFloors}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('captures.selectFloor')} />
                </SelectTrigger>
                <SelectContent>
                  {floors.map((floor) => (
                    <SelectItem key={floor.id} value={floor.id}>
                      {floor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Area selection */}
          {selectedFloor && (
            <div className="space-y-2">
              <Label>{t('captures.selectArea')}</Label>
              <Select 
                value={selectedArea} 
                onValueChange={(v) => {
                  setSelectedArea(v);
                  setSelectedPoint('');
                }}
                disabled={isLoadingAreas}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('captures.selectArea')} />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Capture point selection */}
          {selectedArea && (
            <div className="space-y-2">
              <Label>{t('captures.selectPoint')}</Label>
              <Select value={selectedPoint} onValueChange={setSelectedPoint} disabled={isLoadingPoints}>
                <SelectTrigger>
                  <SelectValue placeholder={t('captures.selectPoint')} />
                </SelectTrigger>
                <SelectContent>
                  {capturePoints.map((point) => (
                    <SelectItem key={point.id} value={point.id}>
                      {point.code} {point.description && `- ${point.description}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Capture type */}
          <div className="space-y-2">
            <Label>{t('captures.captureType')}</Label>
            <RadioGroup
              value={captureType}
              onValueChange={(v) => setCaptureType(v as CaptureCategory)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="photo" id="photo" />
                <Label htmlFor="photo" className="flex items-center gap-1 cursor-pointer">
                  <Image className="w-4 h-4 text-green-500" />
                  {t('captures.photo')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="video" id="video" />
                <Label htmlFor="video" className="flex items-center gap-1 cursor-pointer">
                  <Video className="w-4 h-4 text-blue-500" />
                  {t('captures.video')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="panorama" id="panorama" />
                <Label htmlFor="panorama" className="flex items-center gap-1 cursor-pointer">
                  <View className="w-4 h-4 text-purple-500" />
                  {t('captures.panorama')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label>{t('captures.upload')}</Label>
            <div className="relative">
              {preview ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  {file?.type.startsWith('video/') ? (
                    <video src={preview} className="w-full h-48 object-cover" />
                  ) : (
                    <img src={preview} alt="Preview" className="w-full h-48 object-cover" />
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setFile(null);
                      URL.revokeObjectURL(preview);
                      setPreview(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">{t('captures.upload')}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('captures.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('captures.notesPlaceholder')}
              rows={3}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || createCaptureMutation.isPending}
            className="bg-gradient-to-r from-primary to-accent"
          >
            {createCaptureMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            {t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
