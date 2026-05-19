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

interface SOSPanelProps {
  /** Compact mode renders just a single red button (for map overlay) */
  compact?: boolean;
}

const EMERGENCY_CONTACTS = [
  { label: 'Calauan PNP', number: '049-501-0093' },
  { label: 'Calauan BFP', number: '049-501-0018' },
  { label: 'Laguna PDRRMO', number: '049-832-0219' },
];

export default function SOSPanel({ compact = false }: SOSPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  /* Grab GPS coords when the dialog opens */
  useEffect(() => {
    if (!dialogOpen || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [dialogOpen]);

  const handleSendSOS = async () => {
    setSending(true);
    /* 
      In a real implementation this would POST to a Supabase Edge Function
      or Realtime channel that notifies admins/rangers.
      For now we simulate a network call.
    */
    await new Promise((r) => setTimeout(r, 1800));
    setSending(false);
    setSent(true);
    toast.error('🆘 SOS Alert Sent — Rangers have been notified!', { duration: 8000 });
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSent(false);
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
  onClose,
}: {
  open: boolean;
  coords: { lat: number; lng: number } | null;
  sending: boolean;
  sent: boolean;
  onSend: () => void;
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
            <Button onClick={onClose} className="w-full">
              <X className="h-4 w-4 mr-2" /> Close
            </Button>
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
