import { bookingReceipt, type ReceiptBooking } from '@/lib/bookingReceipt';
import { parseMeta } from '@/lib/bookingMeta';
import { formatPeso } from '@/lib/payments';

export default function BookingReceipt({ booking, showDetails = true }: { booking: ReceiptBooking; showDetails?: boolean }) {
  const meta = parseMeta(booking.notes);
  const receipt = bookingReceipt(booking);
  const completed = booking.status === 'completed' || Boolean(meta.hikeCompletedAt) || meta.groupPhase === 'completed';
  return <section aria-label="Booking receipt" className="min-w-0 space-y-4 text-sm">
    {showDetails && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 [&_dd]:break-words">
      <dt>Lead hiker</dt><dd>{meta.fullName || 'Not recorded'}</dd>
      <dt>Date</dt><dd>{meta.adjustedDate || booking.booking_date || 'Not recorded'}</dd>
      <dt>Start time</dt><dd>{meta.adjustedTime || meta.hikeTime || 'Not recorded'}</dd>
      <dt>Hikers</dt><dd>{booking.group_size ?? meta.groupSize ?? 'Not recorded'}</dd>
      <dt>Guide</dt><dd>{meta.assignedGuide || 'Awaiting assignment'}{meta.guidePhone && <a className="block text-primary underline" href={`tel:${meta.guidePhone}`}>{meta.guidePhone}</a>}</dd>
      <dt>Route</dt><dd>{meta.assignedTrailName || meta.assignedTrail || 'Awaiting assignment'}</dd>
      {!!meta.companions?.length && <><dt>Companions</dt><dd>{meta.companions.join(', ')}</dd></>}
    </dl>}
    <div className="border-y py-3 flex justify-between gap-3"><span>{!meta.originalQuote && receipt.originalTotal != null ? 'Earliest recorded total' : 'Original booking quote'}</span><strong>{receipt.originalTotal == null ? 'Not recorded' : formatPeso(receipt.originalTotal)}</strong></div>
    <div className="space-y-2">
      <h3 className="font-semibold">{completed ? 'Final charges' : 'Current charges'}</h3>
      {receipt.baseLines.map(line => <div key={line.label} className="flex justify-between gap-3"><span>{line.label}</span><span className="shrink-0">{formatPeso(line.amount)}</span></div>)}
      <h4 className="pt-2 font-medium">Additional expenses</h4>
      {receipt.extras.length ? receipt.extras.map((line, index) => <div key={`${line.label}-${index}`} className="flex justify-between gap-3"><span className="break-words min-w-0">{line.label}</span><span className="shrink-0">{formatPeso(line.amount)}</span></div>) : <p className="text-muted-foreground">None recorded</p>}
      <div className="border-t pt-2 flex justify-between font-semibold"><span>Total</span><span>{formatPeso(receipt.total)}</span></div>
      <div className="flex justify-between"><span>Recorded payment</span><span>{formatPeso(receipt.paid)}</span></div>
      <div className="flex justify-between font-semibold"><span>Balance due</span><span>{formatPeso(receipt.balance)}</span></div>
      <p className="text-xs text-muted-foreground">{meta.paymentSettledAt ? `Settled ${new Date(meta.paymentSettledAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Manila)` : 'Payment not yet settled'}</p>
      {(meta.transactionId || meta.paymentReference) && <p className="break-all text-xs">Reference: {meta.transactionId || meta.paymentReference}</p>}
      {meta.changeReturned != null && <p className="text-xs">Change returned: {formatPeso(meta.changeReturned)}</p>}
    </div>
    {!!receipt.history.length && <details><summary className="cursor-pointer py-2 font-medium">Price history ({receipt.history.length})</summary><ol className="space-y-3">{receipt.history.map((entry, index) => <li key={`${entry.changedAt}-${index}`} className="border-t pt-2 text-xs"><p>{formatPeso(entry.previousAmount)} to {formatPeso(entry.newAmount)}</p><p className="break-words">{entry.reason}</p><p>{entry.changedAt && new Date(entry.changedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p></li>)}</ol></details>}
  </section>;
}
