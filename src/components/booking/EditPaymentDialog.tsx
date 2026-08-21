import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DollarSign,
  Clock,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  History,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseMeta, encodeMeta } from '@/lib/bookingMeta';
import {
  calculateFees,
  formatPeso,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type PaymentStatus,
} from '@/lib/payments';
import { useAuth } from '@/hooks/useAuth';

interface EditPaymentDialogProps {
  booking: any | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}

export default function EditPaymentDialog({
  booking,
  open,
  onClose,
  onDone,
}: EditPaymentDialogProps) {
  const { user } = useAuth();
  const [peakHours, setPeakHours] = useState<number>(0);
  const [horseCount, setHorseCount] = useState<number>(0);
  const [customAdjustment, setCustomAdjustment] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('unpaid');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('onsite');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [adminProfile, setAdminProfile] = useState<any | null>(null);

  useEffect(() => {
    if (!booking || !open) return;
    const meta = parseMeta(booking.notes);
    setPeakHours(meta.peakExtensionHours || 0);
    setHorseCount(meta.emergencyHorseCount || 0);
    setCustomAdjustment(0);
    setPaymentStatus((meta.paymentStatus as PaymentStatus) || 'unpaid');
    setPaymentMethod((meta.paymentMethod as PaymentMethod) || 'onsite');
    setAmountPaid(meta.amountPaid ? String(meta.amountPaid) : '');
    setTransactionId(meta.transactionId || '');
    setReason('');

    // Fetch current admin's full name for audit logging
    if (user?.id) {
      supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => setAdminProfile(data));
    }
  }, [booking, open, user]);

  if (!booking) return null;

  const meta = parseMeta(booking.notes);
  const groupSize = booking.group_size || 1;
  const currentTotal = Number(booking.total_amount || 0);

  // Calculate live breakdown with options
  const fees = calculateFees(groupSize, {
    peakExtensionHours: peakHours,
    emergencyHorseCount: horseCount,
    customAdjustment,
  });
  const newTotal = fees.totalFee;

  const handleSavePayment = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for editing the price / payment details.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const adminName = adminProfile?.full_name || user?.email || 'Admin';
      const paid = Number(amountPaid) || (paymentStatus === 'paid' ? newTotal : 0);

      // Create Price History Audit Record
      const newAdjustment = {
        changedAt: now,
        changedBy: user?.id || 'admin',
        changedByName: adminName,
        previousAmount: currentTotal,
        newAmount: newTotal,
        reason: reason.trim(),
        breakdown: {
          entryFee: fees.entryFee,
          envFee: fees.envFee,
          guideFee: fees.guideFee,
          peakExtensionFee: fees.peakExtensionFee,
          emergencyHorseFee: fees.emergencyHorseFee,
          customAdjustment: fees.customAdjustment,
        },
      };

      const updatedPriceHistory = [
        ...(meta.priceAdjustments || []),
        newAdjustment,
      ];

      const updatedMeta = encodeMeta({
        ...meta,
        peakExtensionHours: peakHours > 0 ? peakHours : undefined,
        peakExtensionFee: fees.peakExtensionFee > 0 ? fees.peakExtensionFee : undefined,
        emergencyHorseCount: horseCount > 0 ? horseCount : undefined,
        emergencyHorseFee: fees.emergencyHorseFee > 0 ? fees.emergencyHorseFee : undefined,
        paymentStatus,
        paymentMethod,
        amountPaid: paid,
        transactionId: transactionId.trim() || undefined,
        entryFee: fees.entryFee,
        envFee: fees.envFee,
        guideFee: fees.guideFee,
        totalFee: newTotal,
        priceAdjustments: updatedPriceHistory,
      });

      // 1. Update Booking record in database
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({
          total_amount: newTotal,
          notes: updatedMeta,
        } as any)
        .eq('id', booking.id);

      if (updateErr) throw updateErr;

      // 2. Insert audit log into booking_messages for hiker & staff visibility
      const auditMessage =
        `💰 Payment Adjusted: Total updated from ${formatPeso(currentTotal)} to ${formatPeso(newTotal)} ` +
        `by ${adminName}. Reason: ${reason.trim()}` +
        (fees.emergencyHorseFee > 0 ? ` (Includes ₱500 Emergency Horse Service)` : '') +
        (fees.peakExtensionFee > 0 ? ` (Includes +${peakHours}hr Peak Extension)` : '');

      await supabase.from('booking_messages' as any).insert({
        booking_id: booking.id,
        sender_role: 'system',
        kind: 'system',
        content: auditMessage,
      } as any);

      toast.success(
        `✅ Payment updated to ${formatPeso(newTotal)}. Price audit history recorded.`
      );
      onDone?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to update payment:', err);
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                Edit Payment &amp; Services
              </DialogTitle>
              <DialogDescription className="text-xs">
                Adjust fees, peak extension hours, or emergency horse services with complete audit history.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-xs sm:text-sm">
          {/* Booking Summary Box */}
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 flex items-center justify-between text-xs">
            <div>
              <span className="text-muted-foreground block">Lead Hiker:</span>
              <span className="font-semibold">{meta.fullName || booking.emergency_contact_name || 'Hiker'}</span>
              <span className="text-muted-foreground ml-1">({groupSize} pax)</span>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground block">Current Total:</span>
              <span className="font-bold text-foreground text-sm">{formatPeso(currentTotal)}</span>
            </div>
          </div>

          {/* Add-ons & Extra Services */}
          <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30 space-y-3">
            <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> Add-On Services &amp; Extensions
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Peak Extension Hours */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center justify-between">
                  <span>Peak Extension</span>
                  <span className="text-[10px] text-muted-foreground">₱100 / hour</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={12}
                    value={peakHours}
                    onChange={(e) => setPeakHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="text-xs h-8 font-bold"
                  />
                  <span className="text-xs text-muted-foreground">hrs</span>
                </div>
                {peakHours > 0 && (
                  <p className="text-[11px] font-semibold text-primary">
                    +{formatPeso(fees.peakExtensionFee)}
                  </p>
                )}
              </div>

              {/* Emergency Horse Service */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center justify-between">
                  <span>Emergency Horse</span>
                  <span className="text-[10px] text-muted-foreground">₱500 / horse</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={horseCount}
                    onChange={(e) => setHorseCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="text-xs h-8 font-bold"
                  />
                  <span className="text-xs text-muted-foreground">qty</span>
                </div>
                {horseCount > 0 && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    +{formatPeso(fees.emergencyHorseFee)}
                  </p>
                )}
              </div>
            </div>

            {/* Custom Surcharge / Adjustment */}
            <div className="space-y-1 pt-1">
              <Label className="text-xs flex items-center justify-between">
                <span>Custom Fee Adjustment / Discount (₱)</span>
                <span className="text-[10px] text-muted-foreground">Use negative for discount</span>
              </Label>
              <Input
                type="number"
                value={customAdjustment}
                onChange={(e) => setCustomAdjustment(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                className="text-xs h-8"
              />
            </div>
          </div>

          {/* Payment Status & Method */}
          <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30 space-y-3">
            <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> Payment Collection Status
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Status</Label>
                <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid" className="text-xs">✅ Paid in Full</SelectItem>
                    <SelectItem value="partial" className="text-xs">🟡 Partially Paid</SelectItem>
                    <SelectItem value="unpaid" className="text-xs">⏳ Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onsite" className="text-xs">💵 Cash / Onsite</SelectItem>
                    <SelectItem value="gcash" className="text-xs">📱 GCash</SelectItem>
                    <SelectItem value="bank_transfer" className="text-xs">🏦 Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount Paid (₱)</Label>
                <Input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder={String(newTotal)}
                  className="text-xs h-8"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Reference / Tx ID</Label>
                <Input
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. GCash ref # or receipt #"
                  className="text-xs h-8"
                />
              </div>
            </div>
          </div>

          {/* Live Recalculated Summary */}
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Base Fees (Reg ₱30 + Env ₱20 + Guide ₱800/8pax):</span>
              <span className="font-semibold">{formatPeso(fees.entryFee + fees.envFee + fees.guideFee)}</span>
            </div>
            {fees.peakExtensionFee > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Peak Extension (+{peakHours}h @ ₱100/h):</span>
                <span className="font-semibold text-primary">+{formatPeso(fees.peakExtensionFee)}</span>
              </div>
            )}
            {fees.emergencyHorseFee > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Emergency Horse Service ({horseCount} @ ₱500):</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{formatPeso(fees.emergencyHorseFee)}</span>
              </div>
            )}
            {customAdjustment !== 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Custom Adjustment:</span>
                <span className="font-semibold">{customAdjustment > 0 ? `+${formatPeso(customAdjustment)}` : formatPeso(customAdjustment)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-border/20 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground block">New Adjusted Total:</span>
                {currentTotal !== newTotal && (
                  <span className="text-[11px] text-muted-foreground line-through mr-1.5">
                    {formatPeso(currentTotal)}
                  </span>
                )}
              </div>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {formatPeso(newTotal)}
              </span>
            </div>
          </div>

          {/* Mandatory Reason Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground flex items-center gap-1">
              <span>Reason for Price / Service Adjustment *</span>
              <span className="text-destructive font-normal">(Required for Audit Log)</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Hiker requested emergency horse assistance for descent; added +1 hr peak extension..."
              rows={2}
              className="text-xs resize-none"
            />
          </div>

          {/* Previous Price Audit History */}
          {meta.priceAdjustments && meta.priceAdjustments.length > 0 && (
            <div className="p-3 rounded-xl bg-background/50 border border-border/30 space-y-2">
              <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                <History className="h-3.5 w-3.5" /> Previous Price Adjustments
              </p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                {meta.priceAdjustments.map((adj: any, idx: number) => (
                  <div key={idx} className="text-[11px] p-2 rounded-lg bg-secondary/30 border border-border/20 space-y-0.5">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{formatPeso(adj.previousAmount)} ➔ {formatPeso(adj.newAmount)}</span>
                      <span className="text-muted-foreground text-[10px]">{new Date(adj.changedAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-muted-foreground">
                      By: <strong className="text-foreground">{adj.changedByName || 'Admin'}</strong>
                    </p>
                    <p className="italic text-foreground/80">"{adj.reason}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2 pt-2 border-t border-border/20">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSavePayment}
            disabled={saving || !reason.trim()}
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving Adjustment…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Save &amp; Record Audit Log
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
