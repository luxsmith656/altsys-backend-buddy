import { useState, useEffect, useCallback } from 'react';
import { Compass as CompassIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface MapCompassProps {
  userPos: [number, number] | null;
  headingOverride?: number | null;
  compact?: boolean;
}

export default function MapCompass({ userPos, headingOverride, compact = false }: MapCompassProps) {
  const [heading, setHeading] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const displayHeading = headingOverride ?? heading;

  useEffect(() => {
    if (headingOverride != null) setHeading(Math.round(headingOverride));
  }, [headingOverride]);

  const requestPermission = useCallback(async () => {
    // iOS 13+ requires permission request
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        setPermission(result);
        if (result === 'granted') {
          startListening();
        }
      } catch {
        setPermission('denied');
      }
    } else {
      setPermission('granted');
      startListening();
    }
  }, []);

  const startListening = useCallback(() => {
    const handler = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading for iOS, alpha for Android
      const compassHeading = (e as any).webkitCompassHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : null);
      if (compassHeading != null) {
        setHeading(Math.round(compassHeading));
      }
    };

    window.addEventListener('deviceorientation', handler, true);
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, []);

  useEffect(() => {
    if (!('DeviceOrientationEvent' in window)) {
      setSupported(false);
      return;
    }

    // Auto-start on non-iOS or if permission already granted
    if (typeof (DeviceOrientationEvent as any).requestPermission !== 'function') {
      setPermission('granted');
      const cleanup = startListening();
      return cleanup;
    }
  }, [startListening]);

  const cardinalDirection = (deg: number): string => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  };

  return (
    <div className={`glass-card rounded-lg flex flex-col items-center ${compact ? 'gap-1 p-2' : 'gap-2 p-3'}`}>
      {/* Compass Rose */}
      <div className={`relative ${compact ? 'h-10 w-10' : 'h-20 w-20'}`}>
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-2 border-border/50" />
        
        {/* Cardinal marks */}
        {['N', 'E', 'S', 'W'].map((dir, i) => (
          <div
            key={dir}
            className={`absolute font-bold ${compact ? 'text-[6px]' : 'text-[8px]'}`}
            style={{
              top: i === 0 ? '2px' : i === 2 ? 'auto' : '50%',
              bottom: i === 2 ? '2px' : 'auto',
              left: i === 3 ? '4px' : i === 1 ? 'auto' : '50%',
              right: i === 1 ? '4px' : 'auto',
              transform: (i === 0 || i === 2) ? 'translateX(-50%)' : 'translateY(-50%)',
              color: dir === 'N' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {dir}
          </div>
        ))}

        {/* Needle */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: displayHeading != null ? -displayHeading : 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 15 }}
        >
          <svg width={compact ? '24' : '40'} height={compact ? '24' : '40'} viewBox="0 0 40 40">
            {/* North (red) */}
            <polygon
              points="20,4 17,20 23,20"
              fill="hsl(0 72% 50%)"
              opacity="0.9"
            />
            {/* South (white/grey) */}
            <polygon
              points="20,36 17,20 23,20"
              fill="hsl(var(--muted-foreground))"
              opacity="0.4"
            />
            {/* Center dot */}
            <circle cx="20" cy="20" r="2.5" fill="hsl(var(--foreground))" />
          </svg>
        </motion.div>
      </div>

      {/* Heading readout */}
      <div className={`text-center ${compact ? '[&>button]:text-[10px] [&>div]:text-xs [&>div:nth-child(2)]:hidden' : ''}`}>
        {!supported ? (
          <div className="text-xs text-muted-foreground">Compass not available</div>
        ) : permission === 'prompt' && displayHeading == null ? (
          <button
            onClick={requestPermission}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <CompassIcon className="h-3 w-3" /> Enable Compass
          </button>
        ) : heading != null ? (
          <>
            <div className="text-lg font-bold leading-none">{heading}°</div>
            <div className="text-[10px] text-muted-foreground">{cardinalDirection(heading)}</div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Calibrating...</div>
        )}
      </div>

      {/* Coordinates */}
      {userPos && !compact && (
        <div className="text-[9px] text-muted-foreground text-center leading-tight">
          {userPos[0].toFixed(5)}°N<br />
          {userPos[1].toFixed(5)}°E
        </div>
      )}
    </div>
  );
}
