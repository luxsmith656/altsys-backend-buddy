export type EmailJsConfig = {
  serviceId: string;
  templateId: string;
  publicKey: string;
};

// These identifiers are public EmailJS integration values. Environment values
// can override them for another service/template without changing the code.
export const DEFAULT_EMAILJS_SERVICE_ID = 'service_nwhz8gy';
export const DEFAULT_EMAILJS_PUBLIC_KEY = 'KX8y6feyx4ifea6_I';
export const DEFAULT_EMAILJS_BOOKING_TEMPLATE_ID = 'template_quhvfai';
export const DEFAULT_EMAILJS_PASSWORD_RESET_TEMPLATE_ID = 'template_dcs8uaj';

export function emailJsConfigFromEnv(
  getEnv: (name: string) => string | undefined,
  templateEnvName: string,
  defaultTemplateId: string,
): EmailJsConfig {
  return {
    serviceId: clean(getEnv('EMAILJS_SERVICE_ID')) || DEFAULT_EMAILJS_SERVICE_ID,
    templateId: clean(getEnv(templateEnvName)) || defaultTemplateId,
    publicKey: clean(getEnv('EMAILJS_PUBLIC_KEY')) || DEFAULT_EMAILJS_PUBLIC_KEY,
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
      template_params: templateParams,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as { id?: unknown; status?: unknown; text?: unknown } | null;
  const accepted = response.ok && (result?.status === 200 || result?.status === 'OK' || result?.text === 'OK' || result?.text === 'ok');
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
