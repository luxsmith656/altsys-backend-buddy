import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
  age: z.coerce.number().int().min(13, 'You must be at least 13').max(120),
  agreed: z.literal(true, { errorMap: () => ({ message: 'You must agree to the terms' }) }),
});

export default function Onboarding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<string>('');
  const [agreed, setAgreed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [dialogAccept, setDialogAccept] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, age, onboarding_completed_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.onboarding_completed_at) {
        navigate(params.get('redirect') || '/dashboard', { replace: true });
        return;
      }
      setFullName(data?.full_name || (user.user_metadata?.full_name as string) || '');
      if (data?.age) setAge(String(data.age));
      setChecking(false);
    })();
  }, [user, loading, navigate, params]);

  // Reset gating each time the dialog opens.
  useEffect(() => {
    if (dialogOpen) {
      setScrolledToBottom(false);
      setDialogAccept(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      });
    }
  }, [dialogOpen]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setScrolledToBottom(true);
  };

  const confirmAgreement = () => {
    setAgreed(true);
    setDialogOpen(false);
  };

  const handleCheckboxChange = (v: boolean) => {
    if (v) {
      // Force user to open the dialog and scroll through.
      setDialogOpen(true);
    } else {
      setAgreed(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ fullName, age, agreed });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || 'Please complete every field');
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          full_name: parsed.data.fullName,
          age: parsed.data.age,
          privacy_accepted_at: now,
          terms_accepted_at: now,
          data_consent_at: now,
          liability_waiver_at: now,
          onboarding_completed_at: now,
        },
        { onConflict: 'user_id' },
      );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Welcome aboard!');
    navigate(params.get('redirect') || '/dashboard', { replace: true });
  };

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 pt-20">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(152_60%_42%/0.06)_0%,_transparent_50%)]" />
      <div className="w-full max-w-xl relative z-10">
        <div className="text-center mb-8">
          <img src={logo} alt="Mt. Kalisungan logo" className="h-12 w-12 rounded-full object-cover mx-auto mb-4 bg-white/5" />
          <h1 className="text-2xl font-bold">Complete your account</h1>
          <p className="text-muted-foreground text-sm mt-1">A few details before you start hiking.</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Dela Cruz" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">Age</Label>
            <Input id="age" type="number" inputMode="numeric" min={13} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 24" required />
          </div>

          <button
            type="button"
            onClick={() => handleCheckboxChange(!agreed)}
            className={`w-full flex items-start gap-3 p-4 rounded-lg border text-left transition ${
              agreed
                ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40'
                : 'border-primary/40 bg-primary/5 hover:bg-primary/10 animate-pulse'
            }`}
          >
            <Checkbox checked={agreed} onCheckedChange={() => handleCheckboxChange(!agreed)} className="mt-0.5 pointer-events-none" />
            <span className="text-sm leading-snug flex-1">
              <span className="flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Do you agree with our Terms & Agreements?
              </span>
              <span className="text-muted-foreground mt-1 block">
                {agreed ? (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Agreement acknowledged. Click to revoke.
                  </span>
                ) : (
                  <>Tap to open and read the full document. You must scroll to the bottom before you can agree.</>
                )}
              </span>
            </span>
            <FileText className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
          </button>

          <Button type="submit" className="w-full h-11 font-bold" disabled={saving || !agreed}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm & Continue
          </Button>
        </form>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Terms & Agreements
            </DialogTitle>
            <DialogDescription>
              Please read the full document. The agree button unlocks once you reach the bottom.
            </DialogDescription>
          </DialogHeader>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto rounded-md border border-border/60 p-4 text-sm space-y-4 bg-background/40"
          >
            <section>
              <h3 className="font-semibold mb-1">1. Data Privacy Act of 2012 (RA 10173)</h3>
              <p className="text-muted-foreground">
                I consent to the collection, processing, and storage of my personal information
                (name, age, contact details, location, and hiking activity) by the Mt. Kalisungan
                Tracking System and the Local Government Unit (LGU) for the purposes of safety
                monitoring, search-and-rescue coordination, capacity planning, and aggregated
                statistical reporting. My data will be stored securely and retained only as long
                as necessary for these purposes, in accordance with the Philippine Data Privacy
                Act of 2012 and its implementing rules and regulations.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-1">2. Terms of Service & Park Rules</h3>
              <p className="text-muted-foreground">
                I agree to comply with the platform's Terms of Service and to follow all posted
                park rules, including but not limited to: registration and check-in / check-out
                procedures, designated trail use, fire and waste restrictions, ranger and guide
                instructions, group-size limits, daily capacity caps, weather-based trail closures,
                and emergency protocols. Violations may result in suspension of access, removal
                from the trail, and reporting to the LGU.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-1">3. Location & Emergency Data</h3>
              <p className="text-muted-foreground">
                I authorize real-time GPS tracking of my device during active hiking sessions and
                the sharing of my location, profile information, and emergency contact details
                with rangers, guides, LGU personnel, and accredited emergency responders in the
                event of an incident, distress signal, SOS activation, or extended inactivity.
                I understand tracking is automatically stopped when I check out or end my session.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-1">4. Assumption of Risk & Liability Waiver</h3>
              <p className="text-muted-foreground">
                I acknowledge that hiking, trekking, and outdoor activities on Mt. Kalisungan
                involve inherent risks including but not limited to: physical injury, illness,
                exhaustion, dehydration, sudden weather changes, rough or unstable terrain,
                wildlife encounters, falling objects, getting lost, and in extreme cases, death.
                I voluntarily and knowingly assume all such risks. To the fullest extent permitted
                by law, I release and hold harmless the LGU, park operators, registered guides,
                rangers, volunteers, and the Mt. Kalisungan Tracking System platform from any
                claim, demand, or liability arising from my participation, except in cases of
                gross negligence or willful misconduct.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-1">5. Account & Communications</h3>
              <p className="text-muted-foreground">
                I confirm that the information I provide is accurate and that I am responsible
                for keeping my account credentials confidential. I consent to receive
                service-related communications (booking confirmations, safety alerts, trail
                advisories, and account notifications) via the platform, email, or SMS.
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-1">6. Revocation</h3>
              <p className="text-muted-foreground">
                I may withdraw my consent at any time by contacting the LGU data protection
                officer or by deleting my account, subject to legal retention requirements for
                safety records.
              </p>
            </section>

            <p className="text-xs text-muted-foreground pt-2 border-t border-border/60">
              By tapping "I agree" below, I confirm that I have read, understood, and agree to
              all of the above in full.
            </p>
          </div>

          <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-3">
            <label className={`flex items-center gap-2 text-sm ${scrolledToBottom ? '' : 'opacity-50'}`}>
              <Checkbox
                checked={dialogAccept}
                disabled={!scrolledToBottom}
                onCheckedChange={(v) => setDialogAccept(!!v)}
              />
              <span>
                {scrolledToBottom
                  ? 'I have read and agree to all of the above'
                  : 'Scroll to the bottom to enable'}
              </span>
            </label>
            <Button type="button" onClick={confirmAgreement} disabled={!dialogAccept}>
              I agree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
