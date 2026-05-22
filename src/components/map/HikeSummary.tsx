import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mountain, Activity, TrendingUp, TrendingDown, Timer, PauseCircle, MapPin, Trophy, Box } from 'lucide-react';
import type { OfflineSession } from '@/lib/offlineDb';
import { getSessionPoints } from '@/lib/offlineDb';
import Replay3D from './Replay3D';

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface Props {
  session: OfflineSession | null;
  open: boolean;
  onClose: () => void;
}

export default function HikeSummary({ session, open, onClose }: Props) {
  const [showReplay, setShowReplay] = useState(false);
  const [pts, setPts] = useState<{ lat: number; lng: number; alt: number }[]>([]);

  useEffect(() => {
    if (!showReplay || !session) return;
    void getSessionPoints(session.id).then((p) =>
      setPts(p.map((x) => ({ lat: x.lat, lng: x.lng, alt: x.alt }))),
    );
  }, [showReplay, session]);

  if (!session) return null;
  const km = (session.distanceM / 1000).toFixed(2);
  const totalTimeSec = session.movingSec + session.restingSec;
  const pace = session.distanceM > 0 ? (session.movingSec / 60) / (session.distanceM / 1000) : 0;

  const stat = (icon: React.ReactNode, label: string, value: string) => (
    <div className="rounded-xl border border-border/30 bg-secondary/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}<span>{label}</span></div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mountain className="h-5 w-5 text-primary" /> Hike summary
          </DialogTitle>
          <DialogDescription>Saved locally. Will sync automatically when you have signal.</DialogDescription>
        </DialogHeader>

        {session.summitReached && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-700 dark:text-amber-300 text-sm">
            <Trophy className="h-4 w-4" /> Summit reached
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {stat(<MapPin className="h-3.5 w-3.5" />, 'Distance', `${km} km`)}
          {stat(<Timer className="h-3.5 w-3.5" />, 'Moving time', fmtTime(session.movingSec))}
          {stat(<PauseCircle className="h-3.5 w-3.5" />, 'Resting time', fmtTime(session.restingSec))}
          {stat(<Activity className="h-3.5 w-3.5" />, 'Avg pace', pace > 0 ? `${pace.toFixed(1)} min/km` : '—')}
          {stat(<TrendingUp className="h-3.5 w-3.5" />, 'Elevation gain', `${session.ascentM} m`)}
          {stat(<TrendingDown className="h-3.5 w-3.5" />, 'Elevation loss', `${session.descentM} m`)}
          {stat(<TrendingUp className="h-3.5 w-3.5" />, 'Ascent time', fmtTime(session.ascentSec))}
          {stat(<TrendingDown className="h-3.5 w-3.5" />, 'Descent time', fmtTime(session.descentSec))}
        </div>

        <div className="text-xs text-muted-foreground">
          Total time: {fmtTime(totalTimeSec)} · Track points compressed and stored offline.
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5 flex-1" onClick={() => setShowReplay((v) => !v)}>
            <Box className="h-4 w-4" /> {showReplay ? 'Hide 3D replay' : 'View 3D replay'}
          </Button>
          <Button onClick={onClose} className="flex-1">Done</Button>
        </div>

        {showReplay && (
          <div className="space-y-2">
            <Replay3D points={pts} />
            <p className="text-[11px] text-muted-foreground text-center">
              Drag to rotate · scroll to zoom · the orange marker animates your ascent path.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
