import { ExternalLink, ShieldCheck } from 'lucide-react';
import { formatPeso } from '@/lib/payments';

type PaymongoQrPaymentProps = {
  amount: number;
};

/**
 * Static QR Ph merchant payment instructions.
 * The image is intentionally public; PayMongo secret keys must stay server-side.
 */
export default function PaymongoQrPayment({ amount }: PaymongoQrPaymentProps) {
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

      <div className="flex justify-center rounded-lg bg-white p-2">
        <img
          src="/payments/qrph-kooketz.jpg"
          alt="Kooketz PayMongo QR Ph payment code"
          className="h-auto max-h-72 w-full max-w-[260px] object-contain"
          loading="lazy"
        />
      </div>

      <div className="space-y-1 text-xs">
        <p>Amount to send: <strong>{formatPeso(amount)}</strong></p>
        <p className="text-muted-foreground">
          After paying, enter the transaction reference and upload your receipt below. Payment remains pending until an admin verifies it.
        </p>
      </div>

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
