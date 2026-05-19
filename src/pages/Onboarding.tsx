import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
  age: z.coerce.number().int().min(13, 'You must be at least 13').max(120),
  privacy: z.literal(true, { errorMap: () => ({ message: 'Required' }) }),
  terms: z.literal(true, { errorMap: () => ({ message: 'Required' }) }),
  dataConsent: z.literal(true, { errorMap: () => ({ message: 'Required' }) }),
  liability: z.literal(true, { errorMap: () => ({ message: 'Required' }) }),
});

export default function Onboarding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<string>('');
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
  const [liability, setLiability] = useState(false);
  const [allAgree, setAllAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    // Prefill from profile / metadata, and skip if already done.
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

  const toggleAll = (v: boolean) => {
    setAllAgree(v);
    setPrivacy(v); setTerms(v); setDataConsent(v); setLiability(v);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ fullName, age, privacy, terms, dataConsent, liability });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || 'Please complete every field');
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: parsed.data.fullName,
        age: parsed.data.age,
        privacy_accepted_at: now,
        terms_accepted_at: now,
        data_consent_at: now,
        liability_waiver_at: now,
        onboarding_completed_at: now,
      })
      .eq('user_id', user.id);
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
          <p className="text-muted-foreground text-sm mt-1">A few details and agreements before you start hiking.</p>
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

          <div className="pt-2 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Legal Agreements
            </div>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition cursor-pointer">
              <Checkbox checked={privacy} onCheckedChange={(v) => setPrivacy(!!v)} className="mt-0.5" />
              <span className="text-sm leading-snug">
                <strong>Data Privacy Act of 2012 (RA 10173).</strong> I consent to the collection,
                processing, and storage of my personal information (name, age, contact, location,
                hiking activity) by the Mt. Kalisungan Tracking System and the LGU for safety,
                monitoring, and statistical purposes, as described in the Privacy Notice.
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition cursor-pointer">
              <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
              <span className="text-sm leading-snug">
                <strong>Terms of Service & Park Rules.</strong> I agree to the Terms of Service and
                to follow all posted park rules, ranger instructions, trail closures, and check-in /
                check-out procedures while on Mt. Kalisungan.
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition cursor-pointer">
              <Checkbox checked={dataConsent} onCheckedChange={(v) => setDataConsent(!!v)} className="mt-0.5" />
              <span className="text-sm leading-snug">
                <strong>Location & Emergency Data.</strong> I authorize real-time GPS tracking
                during active hikes and the sharing of my location and emergency contact details
                with rangers, guides, and emergency responders in the event of an incident or SOS.
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition cursor-pointer">
              <Checkbox checked={liability} onCheckedChange={(v) => setLiability(!!v)} className="mt-0.5" />
              <span className="text-sm leading-snug">
                <strong>Assumption of Risk & Liability Waiver.</strong> I acknowledge that hiking
                involves inherent risks (injury, weather, wildlife, terrain) and I voluntarily
                assume those risks. I release the LGU, park operators, guides, and the platform
                from liability arising from my participation, to the fullest extent permitted by law.
              </span>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/30 cursor-pointer">
              <Checkbox checked={allAgree} onCheckedChange={(v) => toggleAll(!!v)} />
              <span className="text-sm font-semibold">I have read and agree to all of the above.</span>
            </label>
          </div>

          <Button type="submit" className="w-full h-11 font-bold" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm & Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
