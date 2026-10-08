import { useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { Loader2, Mail, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { emailPasswordReset } from '@/lib/accountSecurity';
import { confirmPhoneReset, sendPhoneResetCode } from '@/lib/phonePasswordReset';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
  defaultPhone?: string;
  /** Called after a phone reset succeeds (e.g. sign out). */
  onPhoneResetDone?: () => void;
}

export function ResetPasswordDialog({ open, onOpenChange, defaultEmail = '', defaultPhone = '', onPhoneResetDone }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setConfirmation(null); setCode(''); setPw(''); setPw2(''); };
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  };

  const sendEmail = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    await emailPasswordReset(email, window.location.origin);
    toast.success('Password reset link sent! Check your inbox or spam folder.');
    close(false);
  }); };

  const sendCode = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    setConfirmation(await sendPhoneResetCode(phone, 'reset-recaptcha'));
    toast.success('Code sent by text message.');
  }); };

  const savePhone = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (pw !== pw2) throw new Error('The passwords do not match.');
    await confirmPhoneReset(confirmation!, code, pw);
    toast.success('Your password has been reset. Please sign in.');
    close(false);
    onPhoneResetDone?.();
  }); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>Choose how you want to reset your password.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="email" onValueChange={reset}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email"><Mail className="mr-2 h-4 w-4" />Email</TabsTrigger>
            <TabsTrigger value="phone"><Smartphone className="mr-2 h-4 w-4" />Phone</TabsTrigger>
          </TabsList>
          <TabsContent value="email">
            <form onSubmit={sendEmail} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email address</Label>
                <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send Reset Link
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="phone">
            {!confirmation ? (
              <form onSubmit={sendCode} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="reset-phone">Registered mobile number</Label>
                  <Input id="reset-phone" type="tel" inputMode="tel" placeholder="09123456789" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send Code
                </Button>
              </form>
            ) : (
              <form onSubmit={savePhone} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="reset-code">6-digit code</Label>
                  <Input id="reset-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-pw">New password</Label>
                  <Input id="reset-pw" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-pw2">Confirm new password</Label>
                  <Input id="reset-pw2" type="password" autoComplete="new-password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save New Password
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={reset} disabled={busy}>Use a different number</Button>
              </form>
            )}
          </TabsContent>
        </Tabs>
        <div id="reset-recaptcha" />
      </DialogContent>
    </Dialog>
  );
}
