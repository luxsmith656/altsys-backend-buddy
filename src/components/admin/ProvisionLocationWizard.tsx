/**
 * ProvisionLocationWizard
 * Lets the Central LGU (super_admin) create a new trailhead, its admin account,
 * and an initial set of guides — all in one wizard. Calls the secure
 * `provision-location` edge function which uses the service role key to create
 * auth users.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Loader2, Wand2, MapPin, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GuideForm {
  email: string;
  password: string;
  full_name: string;
  per_trip_fee: string;
  specialty: string;
  languages: string;
}

const blankGuide = (): GuideForm => ({
  email: '', password: '', full_name: '', per_trip_fee: '500', specialty: '', languages: 'English, Filipino',
});

export default function ProvisionLocationWizard({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Location
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [lgu, setLgu] = useState('');
  const [region, setRegion] = useState('CALABARZON');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [centerLat, setCenterLat] = useState('14.1475');
  const [centerLng, setCenterLng] = useState('121.3454');
  const [entryFee, setEntryFee] = useState('60');
  const [defaultGuideFee, setDefaultGuideFee] = useState('500');

  // Admin
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminFullName, setAdminFullName] = useState('');

  // Guides
  const [guides, setGuides] = useState<GuideForm[]>([blankGuide()]);

  const reset = () => {
    setName(''); setSlug(''); setLgu(''); setAddress(''); setDescription('');
    setAdminEmail(''); setAdminPassword(''); setAdminFullName('');
    setGuides([blankGuide()]);
  };

  const submit = async () => {
    if (!name || !slug || !adminEmail || !adminPassword) {
      toast.error('Location name/slug and admin email/password are required.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-location', {
        body: {
          location: {
            name, slug, lgu, region, address, description,
            center_lat: Number(centerLat), center_lng: Number(centerLng),
            entry_fee: Number(entryFee), default_guide_fee: Number(defaultGuideFee),
          },
          admin: { email: adminEmail, password: adminPassword, full_name: adminFullName || 'Trailhead Admin' },
          guides: guides.filter((g) => g.email && g.password && g.full_name),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`✅ Created ${name} with admin + ${(data as any)?.guides?.length ?? 0} guide(s).`);
      reset(); setOpen(false); onCreated?.();
    } catch (e: any) {
      toast.error(`Provisioning failed: ${e.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2" variant="outline">
        <Wand2 className="h-4 w-4" /> Provision new location
      </Button>
    );
  }

  return (
    <Card className="glass-card border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-5 w-5 text-primary" />
          Create new trailhead + admin + guides
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          One wizard. Provisions a working starting-point with its own admin login and seeded guide accounts.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {/* Location */}
        <section className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Location</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *" v={name} setV={setName} ph="Mt. Kalisungan — Lamot 3" />
            <Field label="Slug *" v={slug} setV={setSlug} ph="lamot-3" />
            <Field label="LGU" v={lgu} setV={setLgu} ph="Calauan, Laguna" />
            <Field label="Region" v={region} setV={setRegion} />
            <Field label="Address" v={address} setV={setAddress} className="col-span-2" />
            <Field label="Center latitude" v={centerLat} setV={setCenterLat} />
            <Field label="Center longitude" v={centerLng} setV={setCenterLng} />
            <Field label="Entry fee (₱)" v={entryFee} setV={setEntryFee} />
            <Field label="Default guide fee (₱)" v={defaultGuideFee} setV={setDefaultGuideFee} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </section>

        {/* Admin */}
        <section className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Trailhead admin</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" v={adminFullName} setV={setAdminFullName} />
            <Field label="Email *" v={adminEmail} setV={setAdminEmail} ph="admin-lamot3@example.com" />
            <Field label="Password *" v={adminPassword} setV={setAdminPassword} type="password" />
          </div>
        </section>

        {/* Guides */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-sky-500" /> Initial guides</h4>
            <Button size="sm" variant="outline" onClick={() => setGuides((g) => [...g, blankGuide()])} className="gap-1">
              <Plus className="h-3 w-3" /> Add guide
            </Button>
          </div>
          {guides.map((g, i) => (
            <div key={i} className="rounded-lg border border-border/40 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Full name" v={g.full_name} setV={(v) => updateGuide(setGuides, i, { full_name: v })} />
                <Field label="Per-trip fee (₱)" v={g.per_trip_fee} setV={(v) => updateGuide(setGuides, i, { per_trip_fee: v })} />
                <Field label="Email" v={g.email} setV={(v) => updateGuide(setGuides, i, { email: v })} />
                <Field label="Password" v={g.password} setV={(v) => updateGuide(setGuides, i, { password: v })} type="password" />
                <Field label="Specialty" v={g.specialty} setV={(v) => updateGuide(setGuides, i, { specialty: v })} />
                <Field label="Languages" v={g.languages} setV={(v) => updateGuide(setGuides, i, { languages: v })} />
              </div>
              {guides.length > 1 && (
                <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={() => setGuides((arr) => arr.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              )}
            </div>
          ))}
        </section>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Provision location
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, v, setV, ph, type = 'text', className = '' }: {
  label: string; v: string; setV: (s: string) => void; ph?: string; type?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={v} placeholder={ph} onChange={(e) => setV(e.target.value)} />
    </div>
  );
}

function updateGuide(setter: (g: (prev: GuideForm[]) => GuideForm[]) => void, i: number, patch: Partial<GuideForm>) {
  setter((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
}
