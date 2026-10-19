// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { passwordResetHandler, resetRedirect, type ResetDependencies } from '../../supabase/functions/send-password-reset-emailjs/handler';

const request = (body: unknown = { email: ' Hiker@example.com ', app_url: 'https://mtkali.vercel.app' }) =>
  new Request('https://example.com/reset', { method: 'POST', body: JSON.stringify(body) });
function dependencies(): ResetDependencies {
  return {
    headers: { 'Access-Control-Allow-Origin': '*' },
    config: { serviceId: 'test-service', publicKey: 'test-public', privateKey: 'test-private', templateId: 'test-branded-template' },
    generateLink: vi.fn(async () => ({ data: { properties: { action_link: 'https://auth.example.com/recovery?token=test-token' } }, error: null })),
    fetcher: vi.fn(async () => new Response('OK')),
    report: vi.fn(),
  };
}

describe('public EmailJS password recovery', () => {
  it('generates recovery server-side and sends the configured template with accessToken', async () => {
    const deps = dependencies();
    const response = await passwordResetHandler(request(), deps);
    expect(deps.generateLink).toHaveBeenCalledWith('hiker@example.com', 'https://mtkali.vercel.app/reset-password');
    const [url, options] = vi.mocked(deps.fetcher).mock.calls[0];
    expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      service_id: 'test-service', template_id: 'test-branded-template', user_id: 'test-public', accessToken: 'test-private',
      template_params: { to_email: 'hiker@example.com', reset_link: 'https://auth.example.com/recovery?token=test-token' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/test-private|test-token|action_link/);
    expect(deps.report).toHaveBeenCalledWith('email_accepted');
  });
  it('returns identical responses for an existing account, missing account, and delivery failure', async () => {
    const existing = dependencies();
    const missing = dependencies();
    missing.generateLink = vi.fn(async () => ({ data: null, error: new Error('Account does not exist') }));
    const failed = dependencies();
    failed.fetcher = vi.fn(async () => new Response('sensitive provider detail', { status: 403 }));
    const responses = await Promise.all([existing, missing, failed].map(deps => passwordResetHandler(request(), deps)));
    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    const bodies = await Promise.all(responses.map(r => r.text()));
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
    expect(missing.fetcher).not.toHaveBeenCalled();
    expect(failed.report).toHaveBeenCalledWith('email_delivery_failed');
  });
  it('never returns or logs thrown provider details', async () => {
    const deps = dependencies();
    deps.fetcher = vi.fn(async () => { throw new Error('test-private test-token'); });
    expect(await (await passwordResetHandler(request(), deps)).text()).not.toMatch(/test-private|test-token/);
    expect(deps.report).toHaveBeenCalledWith('recovery_request_failed');
  });
  it.each(['https://attacker.example', 'https://mtkali.vercel.app.evil.test', 'https://mtkali.vercel.app/?next=evil', 'https://user:pass@mtkali.vercel.app', 'https://mtkali.vercel.app/login'])('rejects unsafe app_url %s before generating a token', async app_url => {
    const deps = dependencies();
    expect((await passwordResetHandler(request({ email: 'hiker@example.com', app_url }), deps)).status).toBe(400);
    expect(deps.generateLink).not.toHaveBeenCalled();
  });
  it('accepts the branded reset page URL without duplicating its path', () => {
    expect(resetRedirect('https://mtkali.vercel.app/reset-password')).toBe('https://mtkali.vercel.app/reset-password');
  });
  it('supports unauthenticated preflight requests', async () => {
    const response = await passwordResetHandler(new Request('https://example.com', { method: 'OPTIONS' }), dependencies());
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
  it('rejects invalid email without invoking Auth', async () => {
    const deps = dependencies();
    expect((await passwordResetHandler(request({ email: 'bad', app_url: 'https://mtkali.vercel.app' }), deps)).status).toBe(400);
    expect(deps.generateLink).not.toHaveBeenCalled();
  });
});