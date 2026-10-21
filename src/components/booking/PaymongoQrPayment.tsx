import { useState } from 'react';
import { ExternalLink, RotateCcw, ShieldCheck, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatPeso } from '@/lib/payments';

type PaymongoQrPaymentProps = {
  amount: number;
  checkoutUrl?: string | null;
  automaticVerification?: boolean;
};

/**
 * Static QR Ph merchant payment instructions.
 * The image is intentionally public; PayMongo secret keys must stay server-side.
 */
export default function PaymongoQrPayment({ amount, checkoutUrl, automaticVerification = false }: PaymongoQrPaymentProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const openViewer = () => {
    setZoom(1);
    setViewerOpen(true);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-primary">Pay with QR Ph</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scan the live merchant QR with your bank or e-wallet app.
          </p>
        </div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      </div>

      {automaticVerification && checkoutUrl ? (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-background/60 p-4 text-center">
          <p className="text-sm font-semibold text-foreground">Secure QRPh checkout ready</p>
          <p className="text-xs text-muted-foreground">Open the PayMongo checkout, scan the booking QRPh code, and the webhook will verify the payment automatically.</p>
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open secure QRPh checkout <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={openViewer}
            className="group flex w-full cursor-zoom-in justify-center rounded-lg bg-white p-3 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
            aria-label="Open QR Ph code for zooming"
          >
            <img
              src="/payments/qrph-kooketz.jpg"
              alt="Kooketz PayMongo QR Ph payment code"
              className="h-auto max-h-[min(520px,70vh)] w-full max-w-[440px] object-contain transition-opacity group-hover:opacity-90"
              loading="eager"
            />
          </button>
          <p className="text-center text-xs text-muted-foreground">Click or tap the QR code to enlarge and zoom.</p>
        </>
      )}

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-3xl overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>QR Ph payment code</DialogTitle>
            <DialogDescription>Use your bank or e-wallet app to scan this code.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[68vh] overflow-auto rounded-lg bg-white p-3 sm:p-6">
            <img
              src="/payments/qrph-kooketz.jpg"
              alt="Enlarged Kooketz PayMongo QR Ph payment code"
              className="mx-auto h-auto w-full max-w-none object-contain transition-transform duration-150"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>
              <ZoomOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Zoom out
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setZoom(1)}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}>
              <ZoomIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Zoom in
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-1 text-xs">
        <p>Amount to send: <strong>{formatPeso(amount)}</strong></p>
        <p className="text-muted-foreground">
          Scan the QR above to pay. No receipt upload is required here.
        </p>
      </div>

      {checkoutUrl && !automaticVerification && (
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Continue to PayMongo checkout <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden="true" />
        </a>
      )}

      <a
        href="https://www.paymongo.com/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
      >
        Powered by PayMongo <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}
