import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';
import { signInWithFirebaseGoogle } from '@/lib/firebase-auth';
import { isFirebaseConfigured } from '@/lib/firebase';
import { resolvePostLoginPath } from '@/lib/post-login';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Welcome back!');
      const redirectPath = searchParams.get('redirect');
      navigate(redirectPath || '/dashboard');
    }
  };

  const quickLogin = async (qEmail: string, qPassword: string) => {
    if (loading) return;
    setEmail(qEmail);
    setPassword(qPassword);
    setLoading(true);
    const { error } = await signIn(qEmail, qPassword);
    setLoading(false);
    if (error) {
      toast.error(`${error.message}. Try "Reset test accounts" below.`);
      return;
    }
    toast.success('Signed in');
    const redirectPath = searchParams.get('redirect');
    navigate(redirectPath || '/dashboard');
  };

  const [reseeding, setReseeding] = useState(false);
  const reseedTestAccounts = async () => {
    setReseeding(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-seed-accounts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Reseed failed');
      toast.success(`Reseeded ${j.results?.length ?? 0} test accounts`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReseeding(false);
    }
  };

  const handleGoogle = async () => {
    if (googleLoading) return;
    if (!isFirebaseConfigured()) {
      toast.error('Google sign-in unavailable — Firebase not configured.');
      return;
    }
    setGoogleLoading(true);
    const { error, isNewUser } = await signInWithFirebaseGoogle();
    if (error) {
      setGoogleLoading(false);
      toast.error(error.message);
      return;
    }
    const redirect = searchParams.get('redirect');
    // Optimistic redirect: new users go straight to onboarding while the
    // profile + hiker role upserts finish in the background on the server.
    if (isNewUser) {
      setGoogleLoading(false);
      toast.success('Signed in with Google');
      navigate(redirect ? `/onboarding?redirect=${encodeURIComponent(redirect)}` : '/onboarding');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const next = user ? await resolvePostLoginPath(user.id, redirect) : '/dashboard';
    setGoogleLoading(false);
    toast.success('Signed in with Google');
    navigate(next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(152_60%_42%/0.06)_0%,_transparent_50%)]" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <img src={logo} alt="Mt. Kalisungan logo" className="h-12 w-12 rounded-full object-cover mx-auto mb-4 bg-white/5" />
          <h1 className="text-2xl font-bold">Welcome Back</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to Mt. Kalisungan Tracker</p>
        </div>

        <div className="glass-card rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={googleLoading || !isFirebaseConfigured()}
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <svg className="h-4 w-4 mr-2" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.2-.1-2.3-.4-3.5z"/>
              </svg>
            )}
            Sign in / Sign up with Google
          </Button>
          {!isFirebaseConfigured() && (
            <p className="mt-2 text-[11px] text-muted-foreground text-center">
              Google sign-in requires Firebase config in .env
            </p>
          )}

          <div className="mt-4 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link
              to={searchParams.get('redirect') ? `/register?redirect=${encodeURIComponent(searchParams.get('redirect') || '')}` : '/register'}
              className="text-primary hover:underline"
            >
              Sign Up
            </Link>
          </div>
        </div>

        {/* Quick login buttons for testing */}
        <div className="mt-6 glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3 text-center">Quick Login (Test Accounts)</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => quickLogin('central@kalisungan.ph', 'central123')}>
              LGU Central (super admin)
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => quickLogin('admin@kalisungan.ph', 'admin123')}>
              Main Admin
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => quickLogin('lamot1@kalisungan.ph', 'lamot123')}>
              Lamot 1 Admin
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => quickLogin('lamot2@kalisungan.ph', 'lamot123')}>
              Lamot 2 Admin
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => quickLogin('guide@kalisungan.ph', 'guide123')}>
              Guide
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => quickLogin('hiker@kalisungan.ph', 'hiker123')}>
              Hiker
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
