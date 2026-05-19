/**
 * HikerSessionStreamer
 *
 * Mounted on the hiker map. Detects whether the signed-in user has an
 * active hiker_session (created by the trailhead admin via QR scan) and:
 *  - Streams Kalman-filtered GPS to the server (offline-first via offlineGps)
 *  - Renders the geofenced CheckpointSurveyPrompt with a manual fallback button
 *  - Shows a small live status pill (signal + queued points)
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGpsTracker } from '@/hooks/useGpsTracker';
import { isFirebaseConfigured } from '@/lib/firebase';
import { subscribeActiveHikerSession } from '@/lib/firebase-sessions';
import CheckpointSurveyPrompt from './CheckpointSurveyPrompt';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Wifi, WifiOff, Activity } from 'lucide-react';

export default function HikerSessionStreamer() {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  /* Look up active session for this hiker */
  useEffect(() => {
    if (!user) { setSessionId(null); return; }

    if (isFirebaseConfigured()) {
      const unsubscribe = subscribeActiveHikerSession(user.id, (session) => {
        setSessionId(session?.id ?? null);
        setLocationId(session?.locationId ?? null);
      });
      return unsubscribe;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('hiker_sessions')
        .select('id,location_id,status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setSessionId((data as any)?.id ?? null);
      setLocationId((data as any)?.location_id ?? null);
    })();

    // Refresh when sessions change
    const ch = supabase
      .channel(`my-session-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'hiker_sessions', filter: `user_id=eq.${user.id}` },
        () => {
          void supabase
            .from('hiker_sessions')
            .select('id,location_id,status')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
              setSessionId((data as any)?.id ?? null);
              setLocationId((data as any)?.location_id ?? null);
            });
        }).subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user]);

  const { position, signal, isOnline, pendingQueue } = useGpsTracker({
    sessionId,
    enabled: !!sessionId,
  });

  if (!sessionId) return null;

  return (
    <>
      {/* status pill (top-center) */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-1.5">
        <Badge className="glass-card text-[10px] gap-1 px-2 py-1 border-primary/30">
          <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />
          Live • {signal}
          {!isOnline && <WifiOff className="h-3 w-3 text-orange-500" />}
          {isOnline && <Wifi className="h-3 w-3 text-emerald-500" />}
          {pendingQueue > 0 && <span className="text-orange-400">{pendingQueue} queued</span>}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          className="glass-card h-7 px-2 text-[10px] gap-1"
          onClick={() => setManualOpen(true)}
        >
          <ClipboardCheck className="h-3 w-3" /> Trail check
        </Button>
      </div>

      <CheckpointSurveyPrompt
        sessionId={sessionId}
        userId={user?.id ?? null}
        locationId={locationId}
        position={position}
        manualOpen={manualOpen}
        onManualClosed={() => setManualOpen(false)}
      />
    </>
  );
}
