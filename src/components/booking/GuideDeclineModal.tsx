import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  STANDARD_DECLINE_REASONS,
  declineAndReassignGuide,
} from '@/lib/guideAssignmentService';
import {
  AlertTriangle,
  UserCheck,
  UserX,
  Users,
  Calendar,
  Loader2,
  Phone,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseMeta } from '@/lib/bookingMeta';
import { getBusyGuideIdsForSlot, isGuideEligibleForAssignment } from '@/lib/guideAvailability';

interface GuideDeclineModalProps {
  open: boolean;
  onClose: () => void;
  assignment: any;
  currentGuide: any;
  peerGuides: any[];
  onSuccess: () => void;
}

export default function GuideDeclineModal({
  open,
  onClose,
  assignment,
  currentGuide,
  peerGuides,
  onSuccess,
}: GuideDeclineModalProps) {
  const [reasonCategory, setReasonCategory] = useState<string>('illness');
  const [customReason, setCustomReason] = useState<string>('');
  const [actionType, setActionType] = useState<'reassign' | 'dispatch'>('reassign');
  const [replacementGuideId, setReplacementGuideId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [availablePeers, setAvailablePeers] = useState<any[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  useEffect(() => {
    if (!open || !assignment?.booking) {
      setAvailablePeers([]);
      setReplacementGuideId('');
      return;
    }

    let cancelled = false;
    const booking = assignment.booking;
    const meta = parseMeta(booking.notes);
    const locationId = currentGuide?.location_id || booking.location_id;
    setCheckingAvailability(true);

    if (!locationId) {
      setAvailablePeers([]);
      setReplacementGuideId('');
      setCheckingAvailability(false);
      return () => { cancelled = true; };
    }

    void getBusyGuideIdsForSlot({
      locationId,
      bookingDate: booking.booking_date,
      hikeTime: meta.hikeTime,
      hikeType: meta.hikeType,
      excludeBookingId: assignment.booking_id || booking.id,
    }).then((busyGuideIds) => {
      if (cancelled) return;
      const eligible = peerGuides.filter((guide) =>
        guide.id !== currentGuide?.id
        && guide.is_active
        && isGuideEligibleForAssignment(guide.status)
        && !busyGuideIds.has(guide.id),
      );
      setAvailablePeers(eligible);
      setReplacementGuideId((current) => eligible.some((guide) => guide.id === current) ? current : '');
    }).catch((error) => {
      console.error('Could not load peer guide availability:', error);
      if (!cancelled) {
        // Fail closed: never offer a guide when the conflict check is unavailable.
        setAvailablePeers([]);
        setReplacementGuideId('');
      }
    }).finally(() => {
      if (!cancelled) setCheckingAvailability(false);
    });

    return () => { cancelled = true; };
  }, [open, assignment?.id, assignment?.booking_id, assignment?.booking, assignment?.booking?.id, assignment?.booking?.booking_date, assignment?.booking?.location_id, assignment?.booking?.notes, currentGuide?.id, currentGuide?.location_id, peerGuides]);

  if (!assignment) return null;

  const booking = assignment.booking;
  const meta = parseMeta(booking?.notes);

  const getEffectiveReason = () => {
    const matched = STANDARD_DECLINE_REASONS.find((r) => r.id === reasonCategory);
    const standardText = matched ? matched.label.replace(/^[\p{Emoji}\s]+/u, '') : 'Not available';
    if (reasonCategory === 'custom' || customReason.trim()) {
      return customReason.trim() || standardText;
    }
    return standardText;
  };

  const handleSubmit = async () => {
    const reason = getEffectiveReason();
    if (!reason) {
      toast.error('Please specify a reason for requesting reassignment.');
      return;
    }

    if (actionType === 'reassign' && !replacementGuideId) {
      toast.error('Please select a replacement guide from the list, or choose "Return to Admin Dispatch".');
      return;
    }

    setSubmitting(true);
    try {
      const repGuide = availablePeers.find((g) => g.id === replacementGuideId);

      const res = await declineAndReassignGuide({
        assignmentId: assignment.id,
        bookingId: assignment.booking_id || booking?.id,
        currentGuideId: currentGuide?.id,
        currentGuideName: currentGuide?.full_name || 'Assigned Guide',
        currentGuideUserId: currentGuide?.user_id,
        reason,
        replacementGuideId: actionType === 'reassign' ? repGuide?.id : null,
        replacementGuideName: actionType === 'reassign' ? repGuide?.full_name : null,
        replacementGuideUserId: actionType === 'reassign' ? repGuide?.user_id : null,
        replacementGuidePhone: actionType === 'reassign' ? repGuide?.phone : null,
        hikerUserId: booking?.user_id,
        bookingDate: booking?.booking_date,
        locationId: currentGuide?.location_id || booking?.location_id,
      });

      if (res.success) {
        toast.success(
          actionType === 'reassign'
            ? `Booking reassigned to ${repGuide?.full_name}. Hiker and replacement guide notified.`
            : 'Booking returned to Admin Dispatch pool. Admin and hiker notified.'
        );
        onSuccess();
        onClose();
      } else {
        toast.error(res.error || 'Failed to request reassignment');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error requesting reassignment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <UserX className="h-5 w-5" />
            Request Reassignment
          </DialogTitle>
          <DialogDescription>
            If you cannot guide this confirmed hike, state the reason and request a replacement or return it to admin dispatch.
          </DialogDescription>
        </DialogHeader>

        {/* Booking Summary Box */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 text-xs space-y-1.5">
          <div className="flex justify-between items-center font-semibold text-foreground">
            <span>Booking #{assignment.id.slice(0, 8)}</span>
            <Badge variant="outline">{booking?.booking_date ?? 'Upcoming'}</Badge>
          </div>
          <p className="text-muted-foreground">
            Lead Hiker: <strong className="text-foreground">{meta.fullName || 'Hiker'}</strong> ({booking?.group_size ?? 1} pax)
          </p>
          {meta.hikeTime && <p className="text-muted-foreground">Hike Start: {meta.hikeTime}</p>}
        </div>

        <div className="space-y-4 pt-1 text-sm">
          {/* Reason Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Reason for Reassignment
            </Label>
            <Select value={reasonCategory} onValueChange={setReasonCategory}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {STANDARD_DECLINE_REASONS.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Additional details / custom text */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Additional Details / Specific Reason (optional)
            </Label>
            <Textarea
              placeholder="e.g., Having a fever today, requested Juan to take over..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="text-xs min-h-[65px] resize-none"
            />
          </div>

          {/* Next Action: Reassign or Dispatch */}
          <div className="space-y-2 pt-1 border-t border-border/20">
            <Label className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Next Action
            </Label>
            <RadioGroup
              value={actionType}
              onValueChange={(v) => setActionType(v as 'reassign' | 'dispatch')}
              className="space-y-2"
            >
              <div
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  actionType === 'reassign'
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/30 bg-secondary/10'
                }`}
                onClick={() => setActionType('reassign')}
              >
                <RadioGroupItem value="reassign" id="act-reassign" className="mt-0.5" />
                <div className="text-xs">
                  <Label htmlFor="act-reassign" className="font-semibold text-foreground cursor-pointer">
                    🤝 Reassign to Available Peer Guide
                  </Label>
                  <p className="text-muted-foreground mt-0.5">
                    Directly transfers the booking to another available guide at this trailhead.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  actionType === 'dispatch'
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'border-border/30 bg-secondary/10'
                }`}
                onClick={() => setActionType('dispatch')}
              >
                <RadioGroupItem value="dispatch" id="act-dispatch" className="mt-0.5" />
                <div className="text-xs">
                  <Label htmlFor="act-dispatch" className="font-semibold text-foreground cursor-pointer">
                    📋 Return to Admin Dispatch Pool
                  </Label>
                  <p className="text-muted-foreground mt-0.5">
                    Notifies the LGU admin to find and assign a replacement guide.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Peer Guide Selector if Reassign is picked */}
          {actionType === 'reassign' && (
            <div className="space-y-2 p-3 rounded-xl bg-secondary/20 border border-border/30">
              <Label className="text-xs font-semibold text-foreground">
                Select Replacement Guide
              </Label>
              <Select value={replacementGuideId} onValueChange={setReplacementGuideId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Choose a peer guide…" />
                </SelectTrigger>
                <SelectContent>
                  {availablePeers.map((g) => (
                    <SelectItem key={g.id} value={g.id} className="text-xs">
                      {g.full_name} {g.specialty ? `• ${g.specialty}` : ''}
                    </SelectItem>
                  ))}
                  {availablePeers.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">
                      {checkingAvailability ? 'Checking same-time availability…' : 'No conflict-free peer guides found. Choose "Return to Admin Dispatch" instead.'}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2 pt-2 border-t border-border/20">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting}
            className="text-xs gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <ArrowRight className="h-3.5 w-3.5" />
                Confirm & Notify All Parties
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
