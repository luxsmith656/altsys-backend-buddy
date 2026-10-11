import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, FileText, ShieldCheck } from 'lucide-react';

interface TermsAgreementProps {
  agreed: boolean;
  onAgreedChange: (value: boolean) => void;
}

export default function TermsAgreement({ agreed, onAgreedChange }: TermsAgreementProps) {
  const [open, setOpen] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [dialogAccepted, setDialogAccepted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setScrolledToBottom(false);
    setDialogAccepted(false);
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; });
  }, [open]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 24) setScrolledToBottom(true);
  };

  return (
    <>
      <div className={`w-full rounded-lg border transition ${agreed ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40' : 'border-primary/40 bg-primary/5'}`}>
        <div role="button" tabIndex={agreed ? -1 : 0} className="w-full flex items-start gap-3 p-4 text-left" onClick={() => !agreed && setOpen(true)} onKeyDown={(event) => { if (!agreed && (event.key === 'Enter' || event.key === ' ')) setOpen(true); }}>
          <input aria-label="Terms agreement status" type="checkbox" checked={agreed} readOnly className="mt-0.5 h-4 w-4 accent-primary pointer-events-none" />
          <span className="text-sm leading-snug flex-1">
            <span className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Terms, privacy, and trail safety agreement</span>
            <span className="text-muted-foreground mt-1 block">
              {agreed ? <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="h-3.5 w-3.5" /> Agreement acknowledged.</span> : 'Open and read the agreement before creating your account.'}
            </span>
          </span>
          <FileText className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
        </div>
        {agreed && <div className="px-4 pb-3 -mt-1"><button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">View agreement</button></div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Mt. Kalisungan Terms & Agreement</DialogTitle>
            <DialogDescription>Read the full agreement. The agreement control unlocks at the end.</DialogDescription>
          </DialogHeader>
          <div data-testid="terms-scroll-panel" ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto rounded-md border border-border/60 p-4 text-sm space-y-4 bg-background/40">
            <section><h3 className="font-semibold mb-1">1. Data Privacy Act of 2012 (RA 10173)</h3><p className="text-muted-foreground">I consent to the collection and secure processing of my name, age, contact details, location, and hiking activity by the Mt. Kalisungan Tracking System and the LGU for safety monitoring, emergency coordination, capacity planning, and aggregate reporting, in accordance with Philippine privacy law.</p></section>
            <section><h3 className="font-semibold mb-1">2. Terms of Service & Trail Rules</h3><p className="text-muted-foreground">I will follow registration and check-in procedures, designated trails, guide instructions, group limits, capacity limits, weather closures, and emergency protocols. Violations may result in removal from the trail or account suspension.</p></section>
            <section><h3 className="font-semibold mb-1">3. Location & Emergency Data</h3><p className="text-muted-foreground">I authorize GPS tracking during an active hike and sharing of location, profile, and emergency-contact details with guides, rangers, LGU personnel, and accredited responders when safety or emergency response requires it. Tracking stops when the session ends.</p></section>
            <section><h3 className="font-semibold mb-1">4. Assumption of Risk</h3><p className="text-muted-foreground">I understand that hiking involves risks including injury, illness, exhaustion, dehydration, weather changes, unstable terrain, getting lost, and death. I voluntarily assume these risks to the fullest extent permitted by law, except for gross negligence or willful misconduct.</p></section>
            <section><h3 className="font-semibold mb-1">5. Account & Communications</h3><p className="text-muted-foreground">I confirm that my information is accurate, will keep my credentials private, and consent to service messages such as booking confirmations, safety alerts, trail advisories, and account notices.</p></section>
            <section><h3 className="font-semibold mb-1">6. Revocation</h3><p className="text-muted-foreground">I may withdraw consent by contacting the LGU data protection officer or deleting my account, subject to lawful retention of safety records.</p></section>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border/60">By selecting “I agree,” I confirm that I have read, understood, and accepted this agreement.</p>
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-3">
            <label className={`flex items-center gap-2 text-sm ${scrolledToBottom ? '' : 'opacity-50'}`}><input type="checkbox" checked={dialogAccepted} disabled={!scrolledToBottom} onChange={(event) => setDialogAccepted(event.target.checked)} className="h-4 w-4 accent-primary" /><span>{scrolledToBottom ? 'I have read and agree' : 'Scroll to the bottom to enable'}</span></label>
            <Button type="button" disabled={!dialogAccepted} onClick={() => { onAgreedChange(true); setOpen(false); }}>I agree</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
