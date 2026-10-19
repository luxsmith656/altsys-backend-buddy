import { useState, useEffect } from 'react';
import { AlertTriangle, PhoneCall, X, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cancelEmergencyAlert, createEmergencyAlert, updateEmergencyAlertLocation } from '@/lib/emergencyAlerts';
import { enqueue, removeQueuedSos } from '@/lib/offlineDb';

interface SOSPanelProps {
  /** Compact mode renders just a single red button (for map overlay) */
  compact?: boolean;
}

const EMERGENCY_CONTACTS = [
  { label: 'Calauan PNP', number: '049-501-0093' },
  { label: 'Calauan BFP', number: '049-501-0018' },
  { label: 'Laguna PDRRMO', number: '049-832-0219' },
];

interface ActiveSos {
  clientAlertId: string;
  serverAlertId?: string | null;
  sentAt: string;
  pendingSync?: boolean;
  lastLocation?: { lat: number; lng: number } | null;
  lastLocationAt?: string | null;
}

function makeClientAlertId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isNetworkFailure(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? '').toLowerCase();
  return !navigator.onLine || message.includes('network') || message.includes('fetch') || message.includes('offline');
}

function readFreshLocation() {
  return new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 },
    );
  });
}

export default function SOSPanel({ compact = false }: SOSPanelProps) {
  const { user, role } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activeSos, setActiveSos] = useState<ActiveSos | null>(null);
  const [activeSession, setActiveSession] = useState<{ id: string; booking_id: string | null; location_id: string | null } | null>(null);

  const sosStorageKey = user?.id ? `mtk-active-sos:${user.id}` : null;

  useEffect(() => {
    if (!sosStorageKey) return;
    try {
      const saved = localStorage.getItem(sosStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ActiveSos;
        setActiveSos(parsed);
        setSent(true);
      }
    } catch {
      localStorage.removeItem(sosStorageKey);
    }
  }, [sosStorageKey]);

  // The reporter's device may still have the active SOS cached after an admin
  // resolves it. Mirror the server status so the next SOS is never blocked by
  // stale local state, including after a page reload.
  useEffect(() => {
    const alertId = activeSos?.serverAlertId;
    if (!alertId || !user?.id) return;
    let disposed = false;
    const clearResolved = () => {
      if (disposed) return;
      if (sosStorageKey) localStorage.removeItem(sosStorageKey);
      void removeQueuedSos(activeSos.clientAlertId);
      setActiveSos(null);
      setSent(false);
    };
    const checkStatus = async () => {
      if (!navigator.onLine) return;
      const { data } = await supabase.from('emergency_alerts' as any).select('status').eq('id', alertId).maybeSingle();
      if (data && !['open', 'acknowledged'].includes(String((data as any).status))) clearResolved();
    };
    void checkStatus();
    const channel = supabase.channel(`sos-status-${alertId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'emergency_alerts', filter: `id=eq.${alertId}` }, (payload) => {
        if (!['open', 'acknowledged'].includes(String((payload.new as any)?.status))) clearResolved();
      })
      .subscribe();
    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [activeSos?.clientAlertId, activeSos?.serverAlertId, sosStorageKey, user?.id]);

  useEffect(() => {
    const onSynced = (event: Event) => {
      const detail = (event as CustomEvent<{ clientAlertId?: string; alertId?: string | null }>).detail;
      if (!detail?.clientAlertId || detail.clientAlertId !== activeSos?.clientAlertId) return;
      const next = { ...activeSos, serverAlertId: detail.alertId, pendingSync: false };
      setActiveSos(next);
      if (sosStorageKey) localStorage.setItem(sosStorageKey, JSON.stringify(next));
    };
    window.addEventListener('sos-synced', onSynced);
    return () => window.removeEventListener('sos-synced', onSynced);
  }, [activeSos, sosStorageKey]);

  useEffect(() => {
    if (!sent || !user?.id || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((position) => {
      const nextCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCoords(nextCoords);
      setActiveSos((current) => {
        if (!current) return current;
        const next = { ...current, lastLocation: nextCoords, lastLocationAt: new Date().toISOString() };
        if (sosStorageKey) localStorage.setItem(sosStorageKey, JSON.stringify(next));
        if (current.serverAlertId) {
          void updateEmergencyAlertLocation(current.serverAlertId, {
            latitude: nextCoords.lat,
            longitude: nextCoords.lng,
          }).catch(() => undefined);
        }
        return next;
      });
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 15_000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [sent, user?.id, sosStorageKey]);

  /* Grab GPS coords when the dialog opens */
  useEffect(() => {
    if (!dialogOpen || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen || !user?.id) return;
    void supabase.from('hiker_sessions')
      .select('id,booking_id,location_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setActiveSession(data));
  }, [dialogOpen, user?.id]);

  const handleSendSOS = async () => {
    if (!user?.id) {
      toast.error('Sign in before sending an SOS alert.');
      return;
    }
    if (activeSos) return;
    setSending(true);
    try {
      // Always try a fresh fix at the moment the SOS is confirmed. The
      // dialog-open fix can be stale or still pending on mobile browsers.
      const freshCoords = await readFreshLocation();
      if (freshCoords) {
        setCoords(freshCoords);
      }
      const pushCoords = freshCoords ?? coords;
      let locationId = activeSession?.location_id || null;
      if (!locationId && activeSession?.booking_id) {
        const { data } = await supabase.from('bookings').select('location_id').eq('id', activeSession.booking_id).maybeSingle();
        locationId = data?.location_id || null;
      }
      const clientAlertId = makeClientAlertId();
      const payload = {
        userId: user.id,
        reporterRole: role,
        bookingId: activeSession?.booking_id,
        sessionId: activeSession?.id,
        locationId,
        latitude: pushCoords?.lat,
        longitude: pushCoords?.lng,
        clientAlertId,
      };
      let next: ActiveSos;
      try {
        const created = await createEmergencyAlert(payload);
        next = { clientAlertId, serverAlertId: created.id, sentAt: created.created_at, lastLocation: pushCoords, lastLocationAt: new Date().toISOString() };
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        const createdAt = new Date().toISOString();
        await enqueue({ kind: 'sos', payload: {
          clientAlertId,
          userId: user.id,
          reporterRole: role,
          bookingId: activeSession?.booking_id ?? null,
          sessionId: activeSession?.id ?? null,
          locationId,
          latitude: pushCoords?.lat ?? null,
          longitude: pushCoords?.lng ?? null,
          message: 'Emergency assistance requested while offline',
          createdAt,
        } });
        next = { clientAlertId, sentAt: createdAt, pendingSync: true, lastLocation: pushCoords, lastLocationAt: createdAt };
      }
      setActiveSos(next);
      if (sosStorageKey) localStorage.setItem(sosStorageKey, JSON.stringify(next));
      setSent(true);
      toast.error(next.pendingSync ? 'SOS saved offline. It will be sent automatically when connection returns.' : 'SOS alert sent. The assigned admin and emergency team were notified.', { duration: 8000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send SOS alert.');
    } finally {
      setSending(false);
    }
  };

  const handleCancelSOS = async () => {
    if (!activeSos) return;
    try {
      if (activeSos.serverAlertId && navigator.onLine) {
        await cancelEmergencyAlert(activeSos.serverAlertId);
      } else if (activeSos.serverAlertId) {
        await enqueue({ kind: 'sos_cancel', payload: { alertId: activeSos.serverAlertId, clientAlertId: activeSos.clientAlertId, userId: user?.id } });
      }
      await removeQueuedSos(activeSos.clientAlertId);
      if (sosStorageKey) localStorage.removeItem(sosStorageKey);
      setActiveSos(null);
      setSent(false);
      setDialogOpen(false);
      toast.success('SOS alert cancelled.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not cancel the SOS alert.');
    }
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSent(Boolean(activeSos));
    setCoords(null);
  };

  /* ── Compact (map overlay) button ── */
  if (compact) {
    return (
      <>
        <Button
          size="icon"
          className="bg-destructive hover:bg-destructive/90 text-white shadow-lg"
          onClick={() => setDialogOpen(true)}
          aria-label="Send SOS emergency alert"
        >
          <AlertTriangle className="h-4 w-4" />
        </Button>
        <SOSDialog
          open={dialogOpen}
          coords={coords}
          sending={sending}
          sent={sent}
          onSend={handleSendSOS}
          onCancel={handleCancelSOS}
          onClose={handleClose}
        />
      </>
    );
  }

  /* ── Full panel (dashboard) ── */
  return (
    <>
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base mb-1">Emergency SOS</h3>
            <p className="text-sm text-muted-foreground mb-4">
              If you or someone in your group is in danger, press the button below to alert rangers and emergency services.
            </p>

            {/* Emergency contacts list */}
            <div className="space-y-2 mb-4">
              {EMERGENCY_CONTACTS.map((c) => (
                <a
                  key={c.label}
                  href={`tel:${c.number}`}
                  className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                >
                  <PhoneCall className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="font-medium">{c.label}</span>
                  <span className="text-muted-foreground">{c.number}</span>
                </a>
              ))}
            </div>

            <Button
              className="bg-destructive hover:bg-destructive/90 text-white gap-2 w-full sm:w-auto"
              onClick={() => setDialogOpen(true)}
            >
              <AlertTriangle className="h-4 w-4" />
              Send SOS Alert
            </Button>
          </div>
        </div>
      </div>

      <SOSDialog
        open={dialogOpen}
        coords={coords}
        sending={sending}
        sent={sent}
        onSend={handleSendSOS}
        onCancel={handleCancelSOS}
        onClose={handleClose}
      />
    </>
  );
}

/* ── SOS Confirmation Dialog ── */
function SOSDialog({
  open,
  coords,
  sending,
  sent,
  onSend,
  onCancel,
  onClose,
}: {
  open: boolean;
  coords: { lat: number; lng: number } | null;
  sending: boolean;
  sent: boolean;
  onSend: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {sent ? 'SOS Alert Sent' : 'Send SOS Emergency Alert'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {sent ? (
                <div className="space-y-3">
                  <p className="text-foreground font-medium">
                    ✅ Your emergency alert has been sent. Rangers and local authorities have been notified.
                  </p>
                  <p className="text-muted-foreground">
                    Stay calm, stay in place if possible, and keep your phone charged.
                  </p>
                  {coords && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/30 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span>
                        Location sent: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground">Emergency contacts:</p>
                    {EMERGENCY_CONTACTS.map((c) => (
                      <a
                        key={c.label}
                        href={`tel:${c.number}`}
                        className="flex items-center gap-2 hover:text-primary transition-colors"
                      >
                        <PhoneCall className="h-3.5 w-3.5 text-primary" />
                        <span>{c.label} — {c.number}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p>
                    This will immediately notify <strong>on-duty rangers</strong> and send your GPS coordinates to
                    emergency services.
                  </p>
                  {coords ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/30 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span>
                        GPS found: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                      <span>GPS unavailable — alert will be sent without coordinates.</span>
                    </div>
                  )}
                  <p className="text-muted-foreground">Only use in a real emergency.</p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {sent ? (
            <>
              <Button variant="outline" onClick={onCancel} className="w-full">
                <X className="h-4 w-4 mr-2" /> Cancel SOS
              </Button>
              <Button onClick={onClose} className="w-full">Close</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button
                className="bg-destructive hover:bg-destructive/90 text-white gap-2"
                onClick={onSend}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {sending ? 'Sending…' : 'Send SOS Now'}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
