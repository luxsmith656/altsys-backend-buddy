import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { HORSE_HELP_OPTIONS, requestHorseHelpForBooking, type HorseHelpStation } from '@/lib/hikeSupport';
import { formatPeso } from '@/lib/payments';

export default function GuideActiveSupportActions({ bookingId }: { bookingId: string }) {
  const { user } = useAuth();
  const [guide, setGuide] = useState<{ id: string; full_name: string; location_id: string } | null>(null);
  const [station, setStation] = useState<HorseHelpStation>('station-5-3');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void supabase.from('guides').select('id,full_name,location_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setGuide(data as typeof guide));
  }, [user?.id]);

  const request = async () => {
    if (!guide || !user?.id) return;
    setSending(true);
    try {
      await requestHorseHelpForBooking({
        bookingId,
        station,
        guideId: guide.id,
        guideName: guide.full_name,
        guideUserId: user.id,
        locationId: guide.location_id,
      });
      toast.success('Horse help request sent. Admin has been alerted to collect the added fee.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send horse help request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-amber-400/40 bg-amber-50/60 p-2 dark:bg-amber-950/20">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Need horse assistance?</p>
      <div className="flex flex-wrap gap-2">
        <Select value={station} onValueChange={(value) => setStation(value as HorseHelpStation)}>
          <SelectTrigger className="h-9 min-w-[175px] text-xs" aria-label="Horse help station"><SelectValue /></SelectTrigger>
          <SelectContent>{HORSE_HELP_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label} · {formatPeso(option.fee)}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={() => void request()} disabled={sending || !guide}>
          {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send help
        </Button>
      </div>
    </div>
  );
}
