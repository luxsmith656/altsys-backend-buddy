import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logo from '@/assets/logo.png';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const hasRecoveryHash = hashParams.get('type') === 'recovery' || Boolean(hashParams.get('access_token') && hashParams.get('refresh_token'));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === 'PASSWORD_RECOVERY' || hasRecoveryHash) && session) setRecoveryReady(true);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (active && hasRecoveryHash && data.session) setRecoveryReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('The passwords do not match.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Your password has been reset. Please sign in.');
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-4 py-12">
      <section className="glass-card relative z-10 w-full max-w-md rounded-xl p-6 sm:p-8">
        <div className="mb-6 text-center">
          <img src={logo} alt="Mt. Kalisungan logo" className="mx-auto mb-4 h-12 w-12 rounded-full object-cover" />
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <p className="mt-2 text-sm text-muted-foreground">Mt. Kalisungan System account recovery</p>
        </div>
        {recoveryReady ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-new-password">New password</Label>
              <Input id="reset-new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm-password">Confirm new password</Label>
              <Input id="reset-confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Save New Password
            </Button>
          </form>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">This recovery link is missing, expired, or already used. Request a fresh link to continue.</p>
            <Button asChild className="w-full"><Link to="/login">Return to sign in</Link></Button>
          </div>
        )}
      </section>
    </main>
  );
}
