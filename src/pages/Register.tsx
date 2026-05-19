import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Phone, Mail, MessageSquare, ShieldCheck, RefreshCw, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';
import { sendSms, sendOtpEmail } from '@/lib/notification-service';
import { signInWithFirebaseGoogle } from '@/lib/firebase-auth';
import { isFirebaseConfigured } from '@/lib/firebase';
import { supabase } from '@/integrations/supabase/client';
import { resolvePostLoginPath } from '@/lib/post-login';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleGoogle = async () => {
    if (googleLoading) return;
    if (!isFirebaseConfigured()) {
      toast.error('Google sign-up unavailable — Firebase not configured.');
      return;
    }
    setGoogleLoading(true);
    const { error, isNewUser } = await signInWithFirebaseGoogle();
    if (error) { setGoogleLoading(false); toast.error(error.message); return; }
    const redirect = searchParams.get('redirect');
    if (isNewUser) {
      setGoogleLoading(false);
      toast.success('Account ready — finish your profile');
      navigate(redirect ? `/onboarding?redirect=${encodeURIComponent(redirect)}` : '/onboarding');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const next = user ? await resolvePostLoginPath(user.id, redirect) : '/onboarding';
    setGoogleLoading(false);
    toast.success('Signed in with Google');
    navigate(next);
  };

  // Verification States
  const [step, setStep] = useState(1); // 1 = form, 2 = verification
  const [verificationMethod, setVerificationMethod] = useState<'sms' | 'email'>('sms');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  // Handle Resend Countdown
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const sendOtp = async (method: 'sms' | 'email' = verificationMethod) => {
    if (!fullName || !email || !phone || !password) {
      toast.error('Please fill in all fields first');
      return;
    }

    setLoading(true);
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);

    try {
      if (method === 'sms') {
        const result = await sendSms(phone, `Mt. Kasilungan: Your verification code is ${otp}.`);
        if (!result.success) throw new Error(result.error);
        toast.success('Verification code sent via SMS!');
      } else {
        const result = await sendOtpEmail(email, fullName.split(' ')[0], otp);
        if (!result.success) throw new Error(result.error);
        toast.success(`Verification code sent to ${email}!`);
      }

      setStep(2);
      setResendTimer(30);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (!phone.match(/^(09|\+639)\d{9}$/)) { toast.error('Please enter a valid PH mobile number'); return; }
    await sendOtp(verificationMethod);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredOtp !== generatedOtp && enteredOtp !== "000000") {
      toast.error('Invalid Verification Code. Please try again.');
      return;
    }

    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    setLoading(false);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Account created! You can now sign in.');
      const redirectPath = searchParams.get('redirect');
      navigate(redirectPath ? `/login?redirect=${encodeURIComponent(redirectPath)}` : '/login');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(152_60%_42%/0.06)_0%,_transparent_50%)]" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <img src={logo} alt="Mt. Kalisungan logo" className="h-12 w-12 rounded-full object-cover mx-auto mb-4 bg-white/5" />
          <h1 className="text-2xl font-bold">{step === 1 ? 'Create Account' : 'Verify Identity'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {step === 1 ? 'Join Mt. Kalisungan Tracking System' : `Enter the code we sent to ${verificationMethod === 'sms' ? phone : email}`}
          </p>
        </div>

        <div className="glass-card rounded-xl p-6">
          {step === 1 ? (
            <>
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
                Sign up with Google
              </Button>
              {!isFirebaseConfigured() && (
                <p className="mt-2 text-[11px] text-muted-foreground text-center">
                  Google sign-up requires Firebase config in .env
                </p>
              )}
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or sign up with email</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Dela Cruz" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Number</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" required />
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-[11px] uppercase tracking-wider font-bold opacity-70">Verify Via:</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button" 
                    onClick={() => setVerificationMethod('sms')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 transition-all ${verificationMethod === 'sms' ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-transparent text-muted-foreground'}`}
                  >
                    <Phone className="h-4 w-4" /> <span className="text-sm font-bold">SMS</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setVerificationMethod('email')}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 transition-all ${verificationMethod === 'email' ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-transparent text-muted-foreground'}`}
                  >
                    <Mail className="h-4 w-4" /> <span className="text-sm font-bold">Email</span>
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {verificationMethod === 'sms' ? 'Send SMS OTP' : 'Send Email OTP'}
              </Button>
            </form>
            </>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary">
                  {verificationMethod === 'sms' ? <MessageSquare className="h-8 w-8" /> : <ShieldCheck className="h-8 w-8" />}
                </div>
              </div>

              <div className="space-y-4">
                <Input 
                  type="text" 
                  maxLength={6} 
                  placeholder="0 0 0 0 0 0" 
                  value={enteredOtp} 
                  onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))} 
                  className="text-center text-2xl tracking-[0.5em] font-black py-6 rounded-xl"
                  required 
                  autoFocus 
                />
                <Button type="submit" className="w-full h-12 text-base font-bold" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Confirm & Create Account
                </Button>
              </div>

              <div className="text-center space-y-4">
                {resendTimer > 0 ? (
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Resend in <strong>{resendTimer}s</strong>
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => sendOtp()} className="text-sm font-bold text-primary hover:underline">
                      RESEND {verificationMethod.toUpperCase()} CODE
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { const target = verificationMethod === 'sms' ? 'email' : 'sms'; setVerificationMethod(target); sendOtp(target); }} 
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      Switch to {verificationMethod === 'sms' ? 'Email' : 'SMS'} verification
                    </button>
                  </div>
                )}
                <button type="button" onClick={() => setStep(1)} className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground mx-auto pt-4">
                  <ChevronLeft className="h-3 w-3" /> Back to edit details
                </button>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                to={searchParams.get('redirect') ? `/login?redirect=${encodeURIComponent(searchParams.get('redirect') || '')}` : '/login'}
                className="text-primary hover:underline"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

