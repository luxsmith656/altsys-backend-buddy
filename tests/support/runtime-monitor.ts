import { expect, type ConsoleMessage, type Page, type Request, type Response } from '@playwright/test';

const APP_ORIGIN = 'http://127.0.0.1:4173';

type MonitorOptions = {
  allowConsole?: RegExp[];
  allowConsoleMessage?: (message: ConsoleMessage) => boolean;
  allowResponse?: (response: Response) => boolean;
};

export function attachRuntimeMonitor(page: Page, options: MonitorOptions = {}) {
  const issues: string[] = [];
  const pending = new Set<Request>();
  page.on('request', (request) => { if (mustValidateRequest(request)) pending.add(request); });
  page.on('requestfinished', (request) => pending.delete(request));

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!options.allowConsoleMessage?.(message) && !options.allowConsole?.some((pattern) => pattern.test(text))) {
      issues.push(`console.error: ${text}`);
    }
  });

  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));

  page.on('requestfailed', (request) => {
    pending.delete(request);
    if (!mustValidateRequest(request)) return;
    issues.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || 'unknown error'})`);
  });

  page.on('response', (response) => {
    if (response.status() < 400 || options.allowResponse?.(response)) return;
    const request = response.request();
    if (!mustValidateRequest(request)) return;
    issues.push(`http ${response.status()}: ${request.method()} ${response.url()}`);
  });

  return {
    issues,
    async waitForRequests() {
      await expect.poll(() => [...pending].map((request) => {
        const url = new URL(request.url());
        return `${request.method()} ${url.origin}${url.pathname}`;
      }), { timeout: 15_000, message: 'Application requests must finish before reload/navigation' }).toEqual([]);
    },
    assertClean() {
      expect(issues, issues.join('\n')).toEqual([]);
    },
  };
}

function mustValidateRequest(request: Request): boolean {
  const url = request.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  const importantResource = ['document', 'script', 'stylesheet'].includes(request.resourceType());
  const isAppRequest = parsed.origin === APP_ORIGIN;
  const isConfiguredBackend = parsed.hostname.endsWith('.supabase.co');
  return importantResource || isAppRequest || isConfiguredBackend;
}

export async function expectRenderedPage(page: Page, pageKey: string, expectedText: string | RegExp) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#root');
    const text = root?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return text.length >= 20 && !text.includes('Loading page...') && !text.includes('Checking access...');
  });

  await expect(page.locator(`[data-route-page="${pageKey}"]`)).toHaveCount(1);
  await expect(page.locator('#root')).toContainText(expectedText);
  await expect(page.getByTestId('fatal-error-boundary')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Oops! Page not found');
}
