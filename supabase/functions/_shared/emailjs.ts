export type EmailJsConfig = {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey?: string;
};

// These identifiers are public EmailJS integration values. Environment values
// can override them for another service/template without changing the code.
export const DEFAULT_EMAILJS_SERVICE_ID = 'service_nwhz8gy';
export const DEFAULT_EMAILJS_PUBLIC_KEY = 'KX8y6feyx4ifea6_I';
export const DEFAULT_EMAILJS_BOOKING_TEMPLATE_ID = 'template_quhvfai';
// The account's template_dcs8uaj is OTP, not password recovery.
export const DEFAULT_EMAILJS_PASSWORD_RESET_TEMPLATE_ID = '';

export function emailJsConfigFromEnv(
  getEnv: (name: string) => string | undefined,
  templateEnvName: string,
  defaultTemplateId: string,
  forbiddenTemplateIds: string[] = [],
): EmailJsConfig {
  const configuredTemplateId = clean(getEnv(templateEnvName));
  return {
    serviceId: clean(getEnv('EMAILJS_SERVICE_ID')) || DEFAULT_EMAILJS_SERVICE_ID,
    // A copy-pasted secret must not make booking confirmations use the reset
    // template (or the reverse). Fall back to the known template instead.
    templateId: configuredTemplateId && !forbiddenTemplateIds.includes(configuredTemplateId)
      ? configuredTemplateId
      : defaultTemplateId,
    publicKey: clean(getEnv('EMAILJS_PUBLIC_KEY')) || DEFAULT_EMAILJS_PUBLIC_KEY,
    privateKey: clean(getEnv('EMAILJS_PRIVATE_KEY')) || undefined,
  };
}

export async function sendEmailJs(
  fetcher: typeof fetch,
  config: EmailJsConfig,
  templateParams: Record<string, string>,
) {
  const response = await fetcher('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      ...(config.privateKey ? { accessToken: config.privateKey } : {}),
      template_params: templateParams,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let result: { id?: unknown; status?: unknown; text?: unknown } | null = null;
  try { result = JSON.parse(raw); } catch { /* EmailJS normally returns plain OK. */ }
  const accepted = response.ok && (raw.trim() === 'OK' || result?.status === 200 || result?.status === 'OK' || result?.text === 'OK' || result?.text === 'ok');
  if (!accepted) {
    const error = new Error(`EmailJS rejected the request (${response.status})`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return typeof result?.id === 'string' && result.id ? result.id : `emailjs-${Date.now()}`;
}

function clean(value: string | undefined) {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}
