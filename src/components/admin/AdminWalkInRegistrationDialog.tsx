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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  UserPlus,
  Users,
  Calendar,
  Clock,
  Phone,
  Mountain,
  DollarSign,
  CheckCircle2,
  Loader2,
  Sparkles,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { encodeMeta } from '@/lib/bookingMeta';
import { calculateFees, formatPeso } from '@/lib/payments';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface AdminWalkInRegistrationDialogProps {
  open: boolean;
  onClose: () => void;
  locationId: string | null;
  onSuccess: () => void;
}

export default function AdminWalkInRegistrationDialog({
  open,
  onClose,
  locationId,
  onSuccess,
}: AdminWalkInRegistrationDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Form State
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [age, setAge] = useState<number>(25);
  const [groupSize, setGroupSize] = useState<number>(1);
  const [bookingDate, setBookingDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [hikeTime, setHikeTime] = useState<string>('06:00 AM');
  const [hikeType, setHikeType] = useState<'day' | 'night'>('day');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [assignedGuideId, setAssignedGuideId] = useState<string>('');
  const [assignedRouteName, setAssignedRouteName] = useState<string>('Summit Trail (Main Peak)');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'onsite'>('cash');
  const [paymentReference, setPaymentReference] = useState('');

  // Available data
  const [guides, setGuides] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<any | null>(null);

  // Load guides for this location
  useEffect(() => {
    if (!open) {
      setCompletedBooking(null);
      return;
    }

    let q = supabase
      .from('guides')
      .select('id, full_name, status, location_id, phone, specialty')
      .eq('is_active', true);
    if (locationId) q = q.eq('location_id', locationId);

    q.then(({ data }) => {
      const list = data || [];
      setGuides(list);
      if (list.length > 0 && !assignedGuideId) {
        setAssignedGuideId(list[0].id);
      }
    });
  }, [open, locationId]);

  // Fees calculation
  const fees = calculateFees(groupSize);
  const totalAmount = fees.total;

  const handleRegisterWalkIn = async () => {
    if (!fullName.trim()) {
      toast.error('Please enter the lead hiker full name.');
      return;
    }
    if (!phoneNumber.trim()) {
      toast.error('Please enter a contact phone number.');
      return;
    }
    if (groupSize < 1 || groupSize > 50) {
      toast.error('Group size must be between 1 and 50.');
      return;
    }

    setSubmitting(true);
    try {
      const selectedGuide = guides.find((g) => g.id === assignedGuideId);
      const bookingId = crypto.randomUUID();
      const qrData = JSON.stringify({
        bookingId,
        leadHiker: fullName.trim(),
        groupSize,
        date: bookingDate,
        isWalkIn: true,
      });

      const metaNotes = encodeMeta({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        age,
        groupSize,
        hikeTime,
        hikeType,
        assignedTrail: assignedRouteName,
        assignedGuide: selectedGuide?.full_name || 'Assigned On-Site',
        assignedGuideId: selectedGuide?.id || null,
        guideStatus: 'accepted',
        medicalNotes: medicalNotes.trim() || undefined,
        userNotes: specialNotes.trim() || undefined,
        isWalkIn: true,
        walkInRegisteredBy: user?.id,
        walkInRegisteredAt: new Date().toISOString(),
        paymentMethod,
        paymentReference: paymentReference.trim() || 'CASH_ONSITE',
      });

      // 1. Insert confirmed booking record
      const { data: newBooking, error: bookingErr } = await supabase
        .from('bookings')
        .insert({
          id: bookingId,
          user_id: user?.id, // registered by admin desk
          booking_date: bookingDate,
          group_size: groupSize,
          status: 'confirmed',
          total_amount: totalAmount,
          qr_code_data: qrData,
          emergency_contact_name: emergencyName.trim() || fullName.trim(),
          emergency_contact_phone: emergencyPhone.trim() || phoneNumber.trim(),
          notes: metaNotes,
          location_id: locationId,
        } as any)
        .select()
        .single();

      if (bookingErr) throw bookingErr;

      // 2. Insert accepted assignment for selected guide
      if (selectedGuide) {
        await supabase.from('booking_assignments' as any).insert({
          booking_id: bookingId,
          guide_id: selectedGuide.id,
          location_id: locationId,
          status: 'accepted',
          decided_at: new Date().toISOString(),
        } as any);

        await supabase.from('booking_messages' as any).insert({
          booking_id: bookingId,
          sender_role: 'system',
          kind: 'system',
          content: `Walk-in hiker group (${groupSize} pax) registered by front desk. Assigned guide: ${selectedGuide.full_name}.`,
        } as any);
      }

      toast.success(`✅ Walk-in registration successful for ${fullName} (${groupSize} pax)!`);
      setCompletedBooking({
        ...newBooking,
        id: bookingId,
        leadHiker: fullName,
        qrCode: qrData,
        guideName: selectedGuide?.full_name,
        assignedGuideId: selectedGuide?.id,
      });
      onSuccess();
    } catch (err: any) {
      console.error('Walk-in registration error:', err);
      toast.error(`Registration failed: ${err?.message || 'Database error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartHikeNow = () => {
    if (!completedBooking) return;
    onClose();
    navigate(`/map?auto=1`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/15 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                On-Site Walk-In Hiker Registration
              </DialogTitle>
              <DialogDescription className="text-xs">
                Register, collect fees, and assign an on-duty tour guide for walk-in hikers at the trailhead desk.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {completedBooking ? (
          /* Success Screen with QR & Fast-Track Check-in */
          <div className="py-4 space-y-5 text-center">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 max-w-md mx-auto space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <h3 className="text-lg font-bold text-foreground">
                Walk-In Confirmed & Registered!
              </h3>
              <p className="text-xs text-muted-foreground">
                Booking Reference: <strong className="text-foreground">#{completedBooking.id.slice(0, 8)}</strong>
              </p>
            </div>

            {/* Generated QR Pass */}
            <div className="p-5 rounded-2xl bg-white text-black inline-block shadow-xl border border-border/40">
              <QRCodeSVG value={completedBooking.qrCode} size={150} />
              <p className="text-[11px] font-bold text-center mt-2 text-zinc-700">
                {completedBooking.leadHiker} ({groupSize} pax)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-xs text-left p-3.5 rounded-xl bg-secondary/30 border border-border/30">
              <div>
                <span className="text-muted-foreground block">Lead Hiker:</span>
                <span className="font-semibold text-foreground">{completedBooking.leadHiker}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Group Size:</span>
                <span className="font-semibold text-foreground">{groupSize} hikers</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Assigned Guide:</span>
                <span className="font-semibold text-primary">{completedBooking.guideName || 'On-Duty Guide'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Fees Collected:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatPeso(totalAmount)} (PAID)</span>
              </div>
            </div>

            <DialogFooter className="flex flex-row justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                Close & Return
              </Button>
              <Button size="sm" onClick={handleStartHikeNow} className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Play className="h-3.5 w-3.5" />
                Start Hike & Live Tracking
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Registration Form */
          <div className="space-y-4 pt-1 text-xs sm:text-sm">
            {/* Section 1: Lead Hiker Details */}
            <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30 space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-4 w-4" /> 1. Lead Hiker & Group Details
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Full Name *</Label>
                  <Input
                    placeholder="e.g. Juan Dela Cruz"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Contact Phone *</Label>
                  <Input
                    placeholder="0917-123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Age</Label>
                    <Input
                      type="number"
                      min={10}
                      max={85}
                      value={age}
                      onChange={(e) => setAge(parseInt(e.target.value, 10) || 25)}
                      className="text-xs h-8"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Group Size *</Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={groupSize}
                      onChange={(e) => setGroupSize(parseInt(e.target.value, 10) || 1)}
                      className="text-xs h-8 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact</Label>
                    <Input
                      placeholder="Contact Name"
                      value={emergencyName}
                      onChange={(e) => setEmergencyName(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Phone</Label>
                    <Input
                      placeholder="Phone"
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Medical / Health Notes (optional)</Label>
                <Input
                  placeholder="e.g. Asthma, hypertension, allergies..."
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            </div>

            {/* Section 2: Trail & Tour Guide Assignment */}
            <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30 space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Mountain className="h-4 w-4" /> 2. Trail Route & On-Duty Guide Assignment
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Hike Date</Label>
                  <Input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Start Time</Label>
                  <Select value={hikeTime} onValueChange={setHikeTime}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Select start time" />
                    </SelectTrigger>
                    <SelectContent>
                      {['05:00 AM', '05:30 AM', '06:00 AM', '06:30 AM', '07:00 AM', '08:00 AM', '09:00 AM', '01:00 PM', '03:00 PM'].map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Trail Route</Label>
                  <Select value={assignedRouteName} onValueChange={setAssignedRouteName}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Pick route" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Summit Trail (Main Peak)" className="text-xs">Summit Trail (Main Peak - 622m)</SelectItem>
                      <SelectItem value="River Trail (Scenic Valley)" className="text-xs">River Trail (Scenic Valley)</SelectItem>
                      <SelectItem value="Ridge Trail (Panoramic)" className="text-xs">Ridge Trail (Panoramic Traverse)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Assign Tour Guide *</Label>
                  <Select value={assignedGuideId} onValueChange={setAssignedGuideId}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Select an on-duty guide…" />
                    </SelectTrigger>
                    <SelectContent>
                      {guides.map((g) => (
                        <SelectItem key={g.id} value={g.id} className="text-xs">
                          {g.full_name} {g.specialty ? `• ${g.specialty}` : ''}
                        </SelectItem>
                      ))}
                      {guides.length === 0 && (
                        <div className="p-2 text-xs text-muted-foreground">No guides registered for this location.</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section 3: Fee Summary & Cash Collection */}
            <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-emerald-500" /> 3. Fee Breakdown & Payment Collection
                </p>
                <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                  Desk Collection
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs py-1 border-y border-border/20">
                <div>
                  <span className="text-muted-foreground block">Registration (₱30):</span>
                  <span className="font-semibold">{formatPeso(fees.entryFee)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Environmental (₱20):</span>
                  <span className="font-semibold">{formatPeso(fees.envFee)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">
                    Guide ({fees.guidesNeeded} × ₱800):
                  </span>
                  <span className="font-semibold">{formatPeso(fees.guideFee)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold">Payment Mode:</span>
                  <div className="flex gap-2">
                    {[
                      { id: 'cash', label: '💵 Cash' },
                      { id: 'gcash', label: '📱 GCash' },
                      { id: 'onsite', label: '💳 POS / Card' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaymentMethod(p.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          paymentMethod === p.id
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border/30 text-muted-foreground hover:bg-secondary/40'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-muted-foreground block">Total to Collect:</span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {formatPeso(totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={submitting} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRegisterWalkIn}
                disabled={submitting || !fullName.trim() || !phoneNumber.trim()}
                className="text-xs gap-1.5 bg-primary"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Registering…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Register & Generate QR Pass
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
