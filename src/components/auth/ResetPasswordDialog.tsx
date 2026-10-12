import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { emailPasswordReset } from '@/lib/accountSecurity';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
}

export function ResetPasswordDialog({ open, onOpenChange, defaultEmail = '' }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  };

  const sendEmail = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    await emailPasswordReset(email, window.location.origin);
    toast.success('Password reset link sent! Check your inbox or spam folder.');
    onOpenChange(false);
  }); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>We will email you a secure, one-time reset link.</DialogDescription>
        </DialogHeader>
        <form onSubmit={sendEmail} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email address</Label>
            <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Mail className="mr-2 h-4 w-4" />Send Reset Link
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
