import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Loader2, ImageUp, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isFirebaseConfigured, uploadGuideProfilePhoto } from '@/lib/firebase-storage';
import logo from '@/assets/logo.png';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the name provided by the admin.'),
  password: z.string().min(8, 'New password must be at least 8 characters.'),
  sex: z.enum(['male', 'female'], { errorMap: () => ({ message: 'Choose male or female.' }) }),
  age: z.coerce.number().int().min(18, 'Guide accounts must be 18 or older.').max(120),
  phone: z.string().trim().min(7, 'Enter a contact number.'),
});

export default function GuideSetupPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [guide, setGuide] = useState<any>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loadingGuide, setLoadingGuide] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login?redirect=%2Fguide%2Fsetup', { replace: true }); return; }
    void (async () => {
      const { data: rawData, error } = await supabase.from('guides' as any)
        .select('id,full_name,phone,photo_url,sex,onboarding_completed_at')
        .eq('user_id', user.id).maybeSingle();
      const data = rawData as any;
      if (error || !data) { toast.error(error?.message || 'Guide profile not found.'); navigate('/guide', { replace: true }); return; }
      if (data.onboarding_completed_at) { navigate('/guide', { replace: true }); return; }
      setGuide(data); setName(data.full_name || user.user_metadata?.full_name || ''); setPhone(data.phone || '');
      setLoadingGuide(false);
    })();
  }, [loading, navigate, user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !guide) return;
    const parsed = schema.safeParse({ name, password, sex, age, phone });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || 'Complete every field.'); return; }
    if (parsed.data.name.toLowerCase() !== String(guide.full_name || '').trim().toLowerCase()) {
      toast.error('The name does not match the guide account created by the admin.'); return;
    }
    if (!photo && !guide.photo_url) { toast.error('Upload a profile photo so hikers can identify you.'); return; }
    setSaving(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password: parsed.data.password, data: { full_name: parsed.data.name, account_type: 'guide' } });
      if (passwordError) throw passwordError;
      let photoUrl = guide.photo_url || null;
      if (photo) {
        if (!isFirebaseConfigured()) throw new Error('Photo storage is not configured. Ask the admin to enable Firebase Storage.');
        const uploaded = await uploadGuideProfilePhoto(photo, guide.id);
        if (!uploaded) throw new Error('Could not store the optimized profile photo.');
        photoUrl = uploaded.url;
      }
      const { error } = await supabase.from('guides' as any).update({
        full_name: parsed.data.name, phone: parsed.data.phone, sex: parsed.data.sex, age: parsed.data.age,
        photo_url: photoUrl, onboarding_completed_at: new Date().toISOString(),
      }).eq('id', guide.id).eq('user_id', user.id);
      if (error) throw error;
      toast.success('Guide profile completed. Welcome to duty.');
      navigate('/guide', { replace: true });
    } catch (error: any) { toast.error(error?.message || 'Could not complete guide setup.'); }
    finally { setSaving(false); }
  };

  if (loading || loadingGuide) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return <main className="min-h-screen flex items-center justify-center px-4 py-12 pt-20">
    <form onSubmit={submit} className="glass-card w-full max-w-lg rounded-2xl p-6 sm:p-8 space-y-5">
      <div className="text-center"><img src={logo} alt="Mt. Kalisungan logo" className="mx-auto mb-3 h-14 w-14 rounded-full object-cover" /><h1 className="text-2xl font-bold">Finish your guide account</h1><p className="mt-1 text-sm text-muted-foreground">Confirm your identity, secure your password, and add the details hikers will see.</p></div>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><span>Use the name provided by the admin. Your photo is optimized and stored in secure file storage; only its URL is saved with your guide profile.</span></div>
      <div className="grid gap-2"><Label htmlFor="guide-name">Full name</Label><Input id="guide-name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="grid gap-2"><Label htmlFor="guide-password">New password</Label><Input id="guide-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required /></div>
      <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Sex</Label><Select value={sex} onValueChange={(v) => setSex(v as 'male' | 'female')}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="guide-age">Age</Label><Input id="guide-age" type="number" min="18" max="120" value={age} onChange={(e) => setAge(e.target.value)} required /></div></div>
      <div className="grid gap-2"><Label htmlFor="guide-phone">Contact number</Label><Input id="guide-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/30 p-3"><ImageUp className="h-5 w-5 text-primary" /><span className="flex-1 text-sm">{photo?.name || (guide.photo_url ? 'Replace profile photo' : 'Upload profile photo')}</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></label>
      <Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save guide profile</Button>
    </form>
  </main>;
}
