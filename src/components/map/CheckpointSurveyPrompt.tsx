import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Smile, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { haversineMeters } from '@/lib/kalmanGps';

interface Checkpoint {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  trigger_radius_m: number;
  location_id: string;
}

interface Props {
  /** active hiker_session id, or null if no active session */
  sessionId: string | null;
  userId: string | null;
  locationId: string | null;
  /** filtered current position (lat, lon) */
  position: [number, number] | null;
  /** Optional: also let guides/hikers manually open via prop trigger */
  manualOpen?: boolean;
  onManualClosed?: () => void;
}

const STORAGE_KEY = 'cp_surveys_done_v1';

function loadDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function saveDone(s: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}

export default function CheckpointSurveyPrompt({
  sessionId, userId, locationId, position, manualOpen, onManualClosed,
}: Props) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [active, setActive] = useState<Checkpoint | null>(null);
  const [experience, setExperience] = useState<'good' | 'concern'>('good');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const doneRef = useRef<Set<string>>(loadDone());

  /* fetch checkpoints for the active location */
  useEffect(() => {
    if (!locationId) { setCheckpoints([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('checkpoints' as any)
        .select('id,name,description,latitude,longitude,trigger_radius_m,location_id')
        .eq('location_id', locationId)
        .order('order_index');
      if (!cancelled) setCheckpoints(((data as unknown as Checkpoint[]) ?? []));
    })();
    return () => { cancelled = true; };
  }, [locationId]);

  /* geofence check on every position update */
  useEffect(() => {
    if (!position || !sessionId || !userId || active) return;
    for (const cp of checkpoints) {
      const key = `${sessionId}:${cp.id}`;
      if (doneRef.current.has(key)) continue;
      const d = haversineMeters(
        { lat: position[0], lon: position[1] },
        { lat: Number(cp.latitude), lon: Number(cp.longitude) },
      );
      if (d <= (cp.trigger_radius_m || 30)) {
        setActive(cp);
        setExperience('good');
        setNotes('');
        toast.info(`Reached checkpoint: ${cp.name}`);
        break;
      }
    }
  }, [position, checkpoints, sessionId, userId, active]);

  /* manual open: pick the nearest unanswered */
  useEffect(() => {
    if (!manualOpen) return;
    if (!checkpoints.length) {
      toast.info('No checkpoints configured for this location.');
      onManualClosed?.();
      return;
    }
    const nearest = position
      ? [...checkpoints].sort((a, b) =>
          haversineMeters({ lat: position[0], lon: position[1] }, { lat: +a.latitude, lon: +a.longitude }) -
          haversineMeters({ lat: position[0], lon: position[1] }, { lat: +b.latitude, lon: +b.longitude }),
        )[0]
      : checkpoints[0];
    setActive(nearest);
    setExperience('good');
    setNotes('');
  }, [manualOpen]);

  const close = (markDone: boolean) => {
    if (markDone && active && sessionId) {
      doneRef.current.add(`${sessionId}:${active.id}`);
      saveDone(doneRef.current);
    }
    setActive(null);
    onManualClosed?.();
  };

  const submit = async () => {
    if (!active || !userId || !locationId) return;
    setSubmitting(true);
    const { error } = await supabase.from('checkpoint_surveys' as any).insert({
      session_id: sessionId,
      user_id: userId,
      location_id: locationId,
      checkpoint_id: active.id,
      experience,
      notes: notes.trim(),
    } as any);
    setSubmitting(false);
    if (error) {
      toast.error('Could not save survey: ' + error.message);
      return;
    }
    toast.success('Thanks! Your trail feedback was recorded.');
    close(true);
  };

  return (
    <Dialog open={!!active} onOpenChange={(o) => !o && close(false)}>
      <DialogContent className="z-[3200] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📍 Checkpoint reached: {active?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Quick trail-condition check. <strong>This is about the trail, not your guide.</strong>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={experience === 'good' ? 'default' : 'outline'}
              className="h-auto py-3 flex-col gap-1"
              onClick={() => setExperience('good')}
            >
              <Smile className="h-5 w-5" />
              <span className="text-xs">All good — no difficulty</span>
            </Button>
            <Button
              type="button"
              variant={experience === 'concern' ? 'destructive' : 'outline'}
              className="h-auto py-3 flex-col gap-1"
              onClick={() => setExperience('concern')}
            >
              <AlertTriangle className="h-5 w-5" />
              <span className="text-xs">Slippery / concern / suggestion</span>
            </Button>
          </div>
          {experience === 'concern' && (
            <div>
              <label className="text-xs text-muted-foreground">Tell us what we should know</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. very slippery rocks after rain, fallen tree across path…"
                rows={3}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(true)}>Skip</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
