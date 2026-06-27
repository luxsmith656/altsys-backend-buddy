import { Button } from '@/components/ui/button';
import { Pause, Play, AlertTriangle, Download, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { TRAILS } from '@/lib/map-data';

interface TrailStatsProps {
  distance: number;
  elapsed: number;
  currentSpeed: number | null;
  gpsSignal: 'Strong' | 'Medium' | 'Weak' | 'None';
  selectedTrail: number;
  offTrail: boolean;
  tracking: boolean;
  offlineReady: boolean;
  trailName?: string;
  trailColor?: string;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onOfflineCache: () => void;
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function TrailStats({
  distance, elapsed, currentSpeed, gpsSignal, selectedTrail, offTrail, tracking, offlineReady,
  trailName,
  trailColor,
  onStartTracking, onStopTracking, onOfflineCache,
}: TrailStatsProps) {
  const avgPace = elapsed > 0 && distance > 0 ? elapsed / 60 / distance : 0;
  const realTimePace = currentSpeed && currentSpeed > 0 ? 60 / currentSpeed : 0;
  const displayPace = realTimePace > 0 ? realTimePace : avgPace;

  const activeTrail = TRAILS[selectedTrail] ?? TRAILS[0];
  const displayTrailName = trailName ?? activeTrail.name;
  const displayTrailColor = trailColor ?? activeTrail.color;

  const GpsIndicator = () => {
    const color = gpsSignal === 'Strong' ? 'text-success' : gpsSignal === 'Medium' ? 'text-warning' : 'text-destructive';
    const bars = gpsSignal === 'Strong' ? 3 : gpsSignal === 'Medium' ? 2 : 1;
    if (gpsSignal === 'None') return null;

    return (
      <div className={`flex items-end gap-0.5 ${color}`}>
        <div className={`h-2 w-1 rounded-sm ${bars >= 1 ? 'bg-current' : 'bg-muted/50'}`} />
        <div className={`h-3 w-1 rounded-sm ${bars >= 2 ? 'bg-current' : 'bg-muted/50'}`} />
        <div className={`h-4 w-1 rounded-sm ${bars >= 3 ? 'bg-current' : 'bg-muted/50'}`} />
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card-strong border-b border-border/30 px-4 py-2"
    >
      <div className="container mx-auto flex items-center justify-between gap-2">
        {/* Compact summary */}
        <div className="min-w-0 flex items-center gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold truncate" style={{ color: displayTrailColor }}>
                {displayTrailName}
              </div>
              {offTrail && (
                <div className="inline-flex items-center gap-1 text-destructive text-xs animate-pulse">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Off Trail</span>
                </div>
              )}
            </div>
            <div className="flex items-baseline gap-3 text-xs text-muted-foreground">
              <GpsIndicator />
              <span className="whitespace-nowrap">
                <span className="text-foreground font-semibold">{distance.toFixed(2)}</span> km
              </span>
              <span className="whitespace-nowrap">
                <span className="text-foreground font-semibold">{formatTime(elapsed)}</span>
              </span>
              <span className="whitespace-nowrap">
                <span className="text-foreground font-semibold">{displayPace > 0 ? displayPace.toFixed(1) : '--'}</span> min/km
              </span>

            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={onOfflineCache}
            disabled={offlineReady}
            aria-label={offlineReady ? 'Map downloaded for offline use' : 'Download map for offline use'}
          >
            {offlineReady ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {offlineReady ? 'Downloaded' : 'Download Map'}
          </Button>
          {tracking ? (
            <Button size="sm" variant="destructive" onClick={onStopTracking} aria-label="Stop tracking" className="gap-1">
              <Pause className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={onStartTracking} aria-label="Start hike" className="gap-1" style={{ backgroundColor: displayTrailColor }}>
              <Play className="h-4 w-4" /> Start
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
