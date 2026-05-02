import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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

  const quickLogin = (email: string, password: string) => {
    setEmail(email);
    setPassword(password);
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
            <Button variant="outline" size="sm" className="text-xs" onClick={() => quickLogin('lamot1@kalisungan.ph', 'lamot1123')}>
              Lamot 1 Admin
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => quickLogin('lamot2@kalisungan.ph', 'lamot2123')}>
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
