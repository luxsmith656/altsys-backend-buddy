import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirming your email…');
  const stateRef = useRef(state);

  useEffect(() => {
    let active = true;
    let redirectTimer: number | undefined;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const authError = hash.get('error_description') || query.get('error_description');

    const finish = () => {
      if (!active) return;
      stateRef.current = 'success';
      setState('success');
      setMessage('Your email is verified. You can now continue to Mt. Kalisungan.');
      redirectTimer = window.setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
    };

    const fail = (reason?: string) => {
      if (!active) return;
      stateRef.current = 'error';
      setState('error');
      setMessage(reason ? decodeURIComponent(reason.replace(/\+/g, ' ')) : 'This verification link is missing, expired, or already used.');
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) finish();
    });

    if (authError) {
      fail(authError);
    } else {
      const code = query.get('code');
      void (async () => {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) { fail(error.message); return; }
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (session) finish();
        else if (!hash.get('access_token') && !code) fail();
      })();
    }

    const timeout = window.setTimeout(() => {
      if (stateRef.current === 'loading') fail();
    }, 10000);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.clearTimeout(timeout);
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [navigate]);

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-4 py-12">
      <section className="glass-card relative z-10 w-full max-w-md rounded-xl p-6 text-center sm:p-8">
        <img src={logo} alt="Mt. Kalisungan logo" className="mx-auto mb-4 h-12 w-12 rounded-full object-cover" />
        {state === 'loading' && <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />}
        {state === 'success' && <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" />}
        {state === 'error' && <XCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />}
        <h1 className="text-2xl font-bold">{state === 'success' ? 'Email verified' : state === 'error' ? 'Verification unavailable' : 'Verifying your email'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {state !== 'loading' && <Button asChild className="mt-6 w-full"><Link to={state === 'success' ? '/dashboard' : '/login'}>{state === 'success' ? 'Continue' : 'Return to sign in'}</Link></Button>}
      </section>
    </main>
  );
}
