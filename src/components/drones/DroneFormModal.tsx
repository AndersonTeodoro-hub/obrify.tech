import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface DroneData {
  id?: string;
  name: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  purchase_date: string;
  total_flight_hours: number;
  status: string;
  notes: string;
}

interface DroneFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: DroneData) => Promise<void>;
  initialData?: DroneData | null;
  loading?: boolean;
}

const MANUFACTURERS = ['DJI', 'Autel', 'Parrot', 'Skydio'];
const STATUSES = ['available', 'maintenance', 'offline'];

export function DroneFormModal({ open, onOpenChange, onSubmit, initialData, loading }: DroneFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<DroneData>({
    name: '', manufacturer: '', model: '', serial_number: '',
    purchase_date: '', total_flight_hours: 0, status: 'available', notes: '',
  });

  useEffect(() => {
    if (initialData) {
      setForm(initialData);
    } else {
      setForm({
        name: '', manufacturer: '', model: '', serial_number: '',
        purchase_date: '', total_flight_hours: 0, status: 'available', notes: '',
      });
    }
  }, [initialData, open]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.serial_number.trim()) return;
    await onSubmit(form);
  };

  const isEdit = !!initialData?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('common.edit') : t('drones.register')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>{t('drones.name')} *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DJI Mavic 3 - #001" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('drones.manufacturer')}</Label>
              <Select value={form.manufacturer} onValueChange={(v) => setForm({ ...form, manufacturer: v })}>
                <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                <SelectContent>
                  {MANUFACTURERS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  <SelectItem value="other">{t('documents.types.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('drones.model')}</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Mavic 3 Enterprise" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('drones.serialNumber')} *</Label>
            <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('drones.purchaseDate')}</Label>
              <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('drones.flightHours')}</Label>
              <Input type="number" min={0} value={form.total_flight_hours} onChange={(e) => setForm({ ...form, total_flight_hours: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('drones.status.label')}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{t(`drones.status.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('documents.notes')}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!form.name.trim() || !form.serial_number.trim() || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t('common.save') : t('drones.register')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
