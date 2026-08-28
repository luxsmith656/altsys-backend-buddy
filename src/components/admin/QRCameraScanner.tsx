import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeResult } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, CameraOff, ScanLine, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface QRCameraScannerProps {
  onScan: (value: string) => void;
  /** Text field value for manual input */
  manualInput: string;
  onManualInputChange: (v: string) => void;
  onManualSubmit: () => void;
  loading?: boolean;
}

const SCANNER_ID = 'qr-camera-scanner-div';

export default function QRCameraScanner({
  onScan,
  manualInput,
  onManualInputChange,
  onManualSubmit,
  loading,
}: QRCameraScannerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
    hasScannedRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraLoading(true);
    hasScannedRef.current = false;
    try {
      // Ensure DOM has rendered and container is available
      await new Promise((resolve) => setTimeout(resolve, 80));

      const el = document.getElementById(SCANNER_ID);
      if (!el) {
        throw new Error('Camera scanner container is not ready. Please try again.');
      }

      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;

      const qrCodeSuccessCallback = (decodedText: string, _result: Html5QrcodeResult) => {
        if (!hasScannedRef.current) {
          hasScannedRef.current = true;
          toast.success('QR Code scanned!');
          onScan(decodedText);
          void stopCamera();
        }
      };

      const config = { fps: 10, qrbox: { width: 240, height: 240 } };

      try {
        // Try back / environment camera first
        await scanner.start({ facingMode: 'environment' }, config, qrCodeSuccessCallback, () => {});
      } catch (backErr) {
        console.warn('Back camera failed, trying default camera:', backErr);
        // Fallback to front / default user camera
        await scanner.start({ facingMode: 'user' }, config, qrCodeSuccessCallback, () => {});
      }

      setCameraActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Camera error: ${msg}`);
      if (scannerRef.current) {
        try { scannerRef.current.clear(); } catch { /* noop */ }
        scannerRef.current = null;
      }
      setCameraActive(false);
    } finally {
      setCameraLoading(false);
    }
  }, [onScan, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="space-y-4">
      {/* Camera toggle */}
      <div className="flex gap-2">
        {!cameraActive ? (
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
            onClick={startCamera}
            disabled={cameraLoading}
          >
            {cameraLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {cameraLoading ? 'Starting camera…' : 'Scan with Camera'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
            onClick={stopCamera}
          >
            <CameraOff className="h-4 w-4" />
            Stop Camera
          </Button>
        )}
      </div>

      {/* Camera view (always mounted in DOM to prevent "Element not found" errors) */}
      <div className={cn('relative transition-all', !cameraActive && !cameraLoading && 'hidden')}>
        <div
          id={SCANNER_ID}
          className={cn(
            'w-full rounded-xl overflow-hidden border border-primary/30 bg-black',
            'min-h-[280px]',
          )}
        />
        {/* Overlay aiming box */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-56 border-2 border-primary/70 rounded-xl shadow-lg flex items-center justify-center">
            <ScanLine className="h-8 w-8 text-primary/50 animate-pulse" />
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">
          Point camera at the QR code
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border/40" />
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">or search manually</span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {/* Manual input: QR code, booking ID, or name */}
      <div className="flex gap-2">
        <Input
          value={manualInput}
          onChange={(e) => onManualInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onManualSubmit(); }}
          placeholder="QR code data, Booking ID, or hiker name…"
          className="font-mono text-sm"
        />
        <Button
          onClick={onManualSubmit}
          disabled={loading || !manualInput.trim()}
          className="gap-2 shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Lookup
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        You can search by QR code data, booking UUID, or hiker's full name.
      </p>
    </div>
  );
}
