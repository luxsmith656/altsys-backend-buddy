import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseMeta, encodeMeta } from '@/lib/bookingMeta';
import { calculateFees, calculatePeakExtensionFee, formatPeso } from '@/lib/payments';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Banknote,
  DollarSign,
  Loader2,
  Mountain,
  Users,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  Receipt,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

interface EndHikeSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  booking: any | null;
  onHikeEnded: () => void;
  adminUser?: any;
}

export default function EndHikeSettlementDialog({
  open,
  onClose,
  booking,
  onHikeEnded,
  adminUser,
}: EndHikeSettlementDialogProps) {
  const [loading, setLoading] = useState(false);
  const [cashTendered, setCashTendered] = useState<string>('');
  const [checkoutHeadcount, setCheckoutHeadcount] = useState<string>('');
  const [headcountVerified, setHeadcountVerified] = useState<boolean>(true);

  const meta = parseMeta(booking?.notes);
  const groupSize = Number(booking?.group_size || meta.actualGroupSize || 1);

  // Fee Calculations
  const { guideFee, entryFee, envFee, totalFee: baseTotalFee } = calculateFees(groupSize, { hikeType: meta.hikeType });
  const registrationAndEnvironmentalFee = entryFee + envFee;
  const peakExtensionFee = calculatePeakExtensionFee(meta.peakExtensionHours);
  const emergencyHorseFee = meta.emergencyHorseFee ?? (meta.emergencyHorseCount ? meta.emergencyHorseCount * 500 : 0);
  const horseHelpFee = (meta.horseHelpRequests ?? [])
    .filter((request) => request.status !== 'cancelled')
    .reduce((sum, request) => sum + Number(request.fee || 0), 0);
  const totalAmountDue = (meta.totalFee ?? baseTotalFee) + peakExtensionFee + emergencyHorseFee + horseHelpFee;

  // Payment Status
  const alreadyPaid = Number(meta.amountPaid ?? (booking?.payment_status === 'paid' ? totalAmountDue : 0));
  const remainingBalance = Math.max(0, totalAmountDue - alreadyPaid);

  const isOnlinePayment =
    (meta.paymentMethod === 'gcash' ||
      meta.paymentMethod === 'bank_transfer' ||
      (booking as any)?.payment_method === 'online' ||
      (booking as any)?.payment_method === 'gcash') &&
    (booking?.payment_status === 'paid' || alreadyPaid >= totalAmountDue);

  const isFullySettled = remainingBalance === 0;

  // Initialize defaults on open
  useEffect(() => {
    if (open && booking) {
      setCheckoutHeadcount(String(groupSize));
      setHeadcountVerified(true);
      setCashTendered(remainingBalance > 0 ? String(remainingBalance) : '0');
    }
  }, [open, booking, groupSize, remainingBalance]);

  // Cash change calculations
  const parsedCash = parseFloat(cashTendered) || 0;
  const changeDue = parsedCash - remainingBalance;
  const isCashSufficient = isFullySettled || parsedCash >= remainingBalance;

  const handleEndHike = async () => {
    if (!booking) return;

    if (!headcountVerified || Number(checkoutHeadcount) !== groupSize) {
      toast.error(`Please verify that all ${groupSize} returning hikers are accounted for.`);
      return;
    }

    if (!isFullySettled && !isOnlinePayment && !isCashSufficient) {
      toast.error(`Cash tendered (₱${parsedCash}) is less than balance due (₱${remainingBalance}).`);
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const updatedNotes = encodeMeta({
        ...meta,
        groupPhase: 'completed',
        hikeCompletedAt: now,
        hikeCompletedBy: adminUser?.id || 'admin',
        guideReviewRequestedAt: now,
        paymentStatus: 'paid',
        paymentMethod: isOnlinePayment ? meta.paymentMethod || 'online' : 'onsite',
        amountPaid: totalAmountDue,
        cashTendered: !isFullySettled ? parsedCash : meta.cashTendered ?? totalAmountDue,
        changeReturned: !isFullySettled ? Math.max(0, changeDue) : meta.changeReturned ?? 0,
        paymentSettledAt: now,
        paymentSettledBy: adminUser?.id || 'admin',
      });

      // 1. Update Hiker Sessions to completed
      try {
        await supabase
          .from('hiker_sessions')
          .update({
            status: 'completed',
            tracking_phase: 'completed',
            end_time: now,
          } as any)
          .eq('booking_id', booking.id)
          .eq('status', 'active');
      } catch (e) {
        console.warn('Non-fatal: hiker session update warning', e);
      }

      // 2. Update Booking Status & Notes (payment_status is embedded in notes metadata)
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          status: 'completed',
          notes: updatedNotes,
        } as any)
        .eq('id', booking.id);

      if (bookingError) throw bookingError;

      // 3. Complete Guide Assignment if one exists
      try {
        await supabase
          .from('booking_assignments' as any)
          .update({ status: 'completed', decided_at: now } as any)
          .eq('booking_id', booking.id);
      } catch (e) {
        console.warn('Non-fatal: booking assignment update warning', e);
      }

      // 4. If guide assigned, update guide roster availability
      try {
        if (meta.assignedGuideId || meta.assignedGuide) {
          let guideQuery = supabase.from('guides' as any).update({ status: 'available' });
          if (meta.assignedGuideId) {
            guideQuery = guideQuery.eq('id', meta.assignedGuideId);
          } else if (meta.assignedGuide) {
            guideQuery = guideQuery.ilike('full_name', meta.assignedGuide);
          }
          await guideQuery;
        }
      } catch (e) {
        console.warn('Non-fatal: guide roster update warning', e);
      }

      // 5. Log Audit Activity
      try {
        await supabase.from('admin_logs').insert({
          action: 'hike_completed',
          entity: 'booking',
          entity_id: booking.id,
          user_id: adminUser?.id || null,
          metadata: {
            bookingId: booking.id,
            completedAt: now,
            totalAmount: totalAmountDue,
            paidOnline: isOnlinePayment,
            cashTendered: parsedCash,
            changeReturned: Math.max(0, changeDue),
            hikerName: meta.fullName || booking.emergency_contact_name,
          },
        } as any);
      } catch (e) {
        console.warn('Non-fatal: activity log insert warning', e);
      }

      toast.success(`🎉 Hike ended for ${meta.fullName || 'group'}! Session marked completed.`);
      onHikeEnded();
      onClose();
    } catch (err: any) {
      console.error('Error ending hike session:', err);
      toast.error(`Failed to end session: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Mountain className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">End Hike & Settle Payment</DialogTitle>
              <DialogDescription className="text-xs">
                Finalize trail closeout, check payment status, and calculate change.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Hiker & Trip Summary */}
          <div className="rounded-2xl border border-border/50 bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground text-sm">
                  {meta.fullName || booking.emergency_contact_name || 'Hiker Lead'}
                </p>
                <p className="text-xs text-muted-foreground font-mono">{booking.id.slice(0, 8)}…</p>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs gap-1">
                <Users className="h-3 w-3" /> {groupSize} Pax
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border/30 pt-2.5">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>{booking.booking_date}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>{meta.hikeTime || 'Standard'}</span>
              </div>
              {meta.assignedGuide && (
                <div className="col-span-2 flex items-center gap-1.5 text-foreground font-medium">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Guide: {meta.assignedGuide}</span>
                </div>
              )}
            </div>
          </div>

          {/* Headcount Verification */}
          <div className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Returned Headcount Verification</span>
              <span className="text-muted-foreground">Booked: {groupSize} pax</span>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                value={checkoutHeadcount}
                onChange={(e) => setCheckoutHeadcount(e.target.value)}
                className="w-24 h-9 text-xs font-bold"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={headcountVerified}
                  onChange={(e) => setHeadcountVerified(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>All {groupSize} hikers safely returned</span>
              </label>
            </div>
          </div>

          {/* Payment Breakdown Card */}
          <div className="rounded-2xl border border-border/50 bg-secondary/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-primary" /> Fee Breakdown
              </span>
              <Badge
                className={
                  isOnlinePayment || isFullySettled
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px]'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px]'
                }
              >
                {isOnlinePayment
                  ? 'Paid Online'
                  : isFullySettled
                  ? 'Settled'
                  : 'Cash Balance Due'}
              </Badge>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                  <span>Guide Fee ({Math.ceil(groupSize / 8)} guide{Math.ceil(groupSize / 8) === 1 ? '' : 's'} · {meta.hikeType === 'overnight' ? '₱1,600' : meta.hikeType === 'night' ? '₱1,000' : '₱800'} each)</span>
                <span className="font-semibold text-foreground">{formatPeso(guideFee)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Registration & Environmental Fee ({groupSize} × ₱30)</span>
                <span className="font-semibold text-foreground">{formatPeso(registrationAndEnvironmentalFee)}</span>
              </div>
              {peakExtensionFee > 0 && (
                <div className="flex justify-between text-primary">
                  <span>Peak Stay Extension (+{meta.peakExtensionHours}h @ ₱100/h)</span>
                  <span className="font-semibold">{formatPeso(peakExtensionFee)}</span>
                </div>
              )}
              {emergencyHorseFee > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Horse / Rescue Service ({meta.emergencyHorseCount || 1} × ₱500)</span>
                  <span className="font-semibold">{formatPeso(emergencyHorseFee)}</span>
                </div>
              )}
              {horseHelpFee > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Guide-requested horse help</span>
                  <span className="font-semibold">{formatPeso(horseHelpFee)}</span>
                </div>
              )}

              <div className="border-t border-border/30 pt-2 flex justify-between text-sm font-bold">
                <span>Total Fee</span>
                <span className="text-foreground">{formatPeso(totalAmountDue)}</span>
              </div>

              {alreadyPaid > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Already Paid ({meta.paymentMethod || 'Online'})</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">-{formatPeso(alreadyPaid)}</span>
                </div>
              )}

              <div className="border-t border-dashed border-border/40 pt-2 flex justify-between items-center">
                <span className="text-xs font-bold text-foreground uppercase">Remaining Balance Due:</span>
                <span className="text-base font-extrabold text-primary">{formatPeso(remainingBalance)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method Handling */}
          {isOnlinePayment || isFullySettled ? (
            /* CASE A: Paid Online / Zero Balance */
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>Paid Online — Payment Fully Settled</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The total amount of <strong>{formatPeso(totalAmountDue)}</strong> was confirmed via{' '}
                <span className="capitalize font-semibold text-foreground">
                  {meta.paymentMethod || 'Online Transfer'}
                </span>
                . No additional cash collection is needed.
              </p>
              {meta.transactionId && (
                <p className="text-[11px] font-mono text-muted-foreground bg-emerald-500/5 px-2 py-1 rounded-md border border-emerald-500/20">
                  Ref / TxID: {meta.transactionId}
                </p>
              )}
            </div>
          ) : (
            /* CASE B: Onsite / Cash Collection with Change Calculator */
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-4 animate-in fade-in">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold text-sm">
                <Banknote className="h-5 w-5 shrink-0" />
                <span>Onsite Cash Collection & Change Calculator</span>
              </div>

              {/* Amount Given Input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-semibold text-foreground">Cash Given by Hiker (₱)</Label>
                  <span className="text-[11px] text-muted-foreground font-medium">Due: {formatPeso(remainingBalance)}</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₱</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    placeholder={String(remainingBalance)}
                    className="pl-8 text-base font-bold h-11 rounded-xl bg-background"
                  />
                </div>
              </div>

              {/* Quick Cash Presets */}
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-medium uppercase">Quick Select Tendered:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[remainingBalance, 500, 1000, 1500, 2000]
                    .filter((val, idx, arr) => arr.indexOf(val) === idx && val >= remainingBalance)
                    .map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCashTendered(String(preset))}
                        className={`h-7 px-2.5 text-xs rounded-lg transition-all ${
                          parsedCash === preset ? 'border-primary bg-primary/10 text-primary font-bold' : ''
                        }`}
                      >
                        {preset === remainingBalance ? `Exact (₱${preset})` : `₱${preset}`}
                      </Button>
                    ))}
                </div>
              </div>

              {/* Change Output Card */}
              <div
                className={`rounded-xl p-3.5 border transition-all ${
                  isCashSufficient
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
                    : 'border-destructive/40 bg-destructive/10 text-destructive'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isCashSufficient ? 'Change to Give Back:' : 'Amount Short:'}
                  </span>
                  <span className="text-xl font-black">
                    {isCashSufficient ? formatPeso(Math.max(0, changeDue)) : formatPeso(Math.abs(changeDue))}
                  </span>
                </div>
                {!isCashSufficient && (
                  <p className="text-[11px] mt-1 text-destructive font-medium">
                    ⚠️ Cash given is less than the remaining balance of {formatPeso(remainingBalance)}.
                  </p>
                )}
                {isCashSufficient && changeDue > 0 && (
                  <p className="text-[11px] mt-0.5 text-emerald-700 dark:text-emerald-300">
                    Hand <strong>{formatPeso(changeDue)}</strong> back to the hiker lead.
                  </p>
                )}
                {isCashSufficient && changeDue === 0 && (
                  <p className="text-[11px] mt-0.5 text-emerald-700 dark:text-emerald-300">
                    Exact amount tendered. No change needed.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="rounded-xl">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleEndHike}
            disabled={loading || !isCashSufficient || !headcountVerified || Number(checkoutHeadcount) !== groupSize}
            className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isOnlinePayment || isFullySettled
              ? 'Complete Hike Session'
              : `Collect ${formatPeso(remainingBalance)} & Complete Hike`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
