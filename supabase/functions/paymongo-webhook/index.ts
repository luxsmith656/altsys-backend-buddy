import { createClient } from 'npm:@supabase/supabase-js@2';
import { paymongoWebhookHandler } from './handler.ts';
const env = (name: string) => (Deno.env.get(name) ?? '').trim();
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(paymongoWebhookHandler({
  secret: env('PAYMONGO_SECRET_KEY'), webhookSecret: env('PAYMONGO_WEBHOOK_SECRET'), fetcher: fetch,
  async loadBooking(id) {
    const { data, error } = await db.from('bookings').select('id,notes').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async process(input) {
    const { data, error } = await db.rpc('process_paymongo_payment', input);
    if (error) throw error;
    return data === true;
  },
}));
