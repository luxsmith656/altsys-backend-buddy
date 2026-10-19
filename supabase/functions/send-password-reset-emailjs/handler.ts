type RecoveryResult = { data: { properties?: { action_link?: string } | null } | null; error: unknown };

export type ResetDependencies = {
  headers: Record<string, string>;
  config: { serviceId: string; publicKey: string; privateKey: string; templateId: string };
  generateLink: (email: string, redirectTo: string) => Promise<RecoveryResult>;
  fetcher: typeof fetch;
  report: (event: string) => void;
};

const allowedOrigins = new Set([
  'https://mtkali.vercel.app',
  'https://altsys-backend-buddy.lovable.app',
  'https://id-preview--aef6e401-3400-422e-8300-005a06482fae.lovable.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);
const accepted = { success: true, message: 'If an account exists for this email, a password-reset link will be sent.' };

export function resetRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!allowedOrigins.has(url.origin) || url.username || url.password || url.search || url.hash) return null;
    if (!['/', '/reset-password', '/reset-password/'].includes(url.pathname)) return null;
    return `${url.origin}/reset-password`;
  } catch {
    return null;
  }
}

export async function passwordResetHandler(req: Request, deps: ResetDependencies): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...deps.headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: deps.headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: 'Request too large' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400);
  const input = body as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400);
  const redirectTo = resetRedirect(input.app_url);
  if (!redirectTo) return json({ error: 'Invalid app_url' }, 400);
  if (Object.values(deps.config).some(value => !value)) return json({ error: 'Password-reset email is not configured' }, 503);

  try {
    const { data, error } = await deps.generateLink(email, redirectTo);
    const link = data?.properties?.action_link;
    if (error || !link) {
      deps.report('recovery_link_unavailable');
    } else {
      const response = await deps.fetcher('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          service_id: deps.config.serviceId,
          template_id: deps.config.templateId,
          user_id: deps.config.publicKey,
          accessToken: deps.config.privateKey,
          template_params: {
            to_email: email,
            email,
            to_name: 'Hiker',
            app_name: 'Mt. Kalisungan',
            reset_link: link,
            reset_url: link,
            confirmation_url: link,
          },
        }),
      });
      // Never log provider bodies: they may echo credentials or the recovery link.
      deps.report(response.ok ? 'email_accepted' : 'email_delivery_failed');
      await response.body?.cancel();
    }
  } catch {
    deps.report('recovery_request_failed');
  }
  // Auth failures, missing accounts and provider failures have the same public response.
  return json(accepted);
}
