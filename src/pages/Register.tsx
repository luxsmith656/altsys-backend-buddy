import { useRef, useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { resolvePostLoginPath } from '@/lib/post-login';
import { validatePasswordConfirmation } from '@/lib/authValidation';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const submitting = useRef(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const onboarding = redirect ? `/onboarding?redirect=${encodeURIComponent(redirect)}` : '/onboarding';

  const handleGoogle = async () => {
    if (googleLoading || submitting.current) return;
    setGoogleLoading(true);
    try {
      const { error, isNewUser } = await signInWithFirebaseGoogle();
      if (error) throw error;
      if (isNewUser) { navigate(onboarding); return; }
      const { data: { user } } = await supabase.auth.getUser();
      navigate(user ? await resolvePostLoginPath(user.id, redirect) : onboarding);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Google sign-up unavailable.');
    } finally { setGoogleLoading(false); }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current || googleLoading) return;
    if (!fullName.trim() || !email.trim() || !phone.trim()) { toast.error('Please fill in all fields'); return; }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    const passwordError = validatePasswordConfirmation(password, confirmPassword);
    if (passwordError) { toast.error(passwordError); return; }
    if (!/^(09|\+639)\d{9}$/.test(phone.trim())) { toast.error('Please enter a valid PH mobile number'); return; }
    submitting.current = true;
    setLoading(true);
    setFormError('');
    try {
      const { error, session } = await signUp(email.trim().toLowerCase(), password, fullName.trim(), searchParams.get('guide'));
      if (error) throw error;
      if (!session) throw new Error('Account submitted, but hosted email confirmation is still enabled. Please contact the administrator to complete account setup.');
      navigate(onboarding);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create your account.';
      setFormError(message);
      toast.error(message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 pt-24 pb-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={logo} alt="Mt. Kalisungan logo" className="h-12 w-12 rounded-full object-cover mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Create Account</h1>
          <p className="text-muted-foreground text-sm mt-1">Join Mt. Kalisungan System</p>
        </div>
        <div className="glass-card rounded-lg p-5 sm:p-6">
          <Button type="button" variant="outline" className="w-full min-h-11" onClick={handleGoogle}
            disabled={googleLoading || loading || !isFirebaseConfigured()}>
            {googleLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Sign up with Google
          </Button>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />or sign up with email<div className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Full Name</Label><Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="phone">Mobile Number</Label><Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" required /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="confirmPassword">Confirm Password</Label><Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <Button type="submit" className="w-full min-h-11" disabled={loading || googleLoading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create Account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">Already have an account?{' '}
            <Link to={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'} className="text-primary hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

