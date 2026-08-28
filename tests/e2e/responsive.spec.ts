import { expect, test } from '@playwright/test';
import { attachRuntimeMonitor } from '../support/runtime-monitor';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const viewport of VIEWPORTS) {
  test(`major public pages remain usable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const path of ['/', '/login', '/register', '/booking', '/map']) {
      const monitor = attachRuntimeMonitor(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (document.querySelector('#root')?.textContent?.trim().length || 0) > 20);
      const overflowDetails = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const offenders = Array.from(document.querySelectorAll<HTMLElement>('*'))
          .map((element) => ({ tag: element.tagName, id: element.id, className: element.className, left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width), ancestors: [element.parentElement, element.parentElement?.parentElement].filter(Boolean).map((parent) => ({ tag: parent!.tagName, className: parent!.className, width: Math.round(parent!.getBoundingClientRect().width), overflow: getComputedStyle(parent!).overflowX })) }))
          .filter((item) => item.right > document.documentElement.clientWidth + 2)
          .slice(0, 5);
        return { overflow, viewport: { innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, bodyWidth: document.body.getBoundingClientRect().width, rootWidth: document.querySelector('#root')?.getBoundingClientRect().width }, offenders };
      });
      expect(overflowDetails.overflow, `${path} overflowed by ${overflowDetails.overflow}px at ${viewport.name}: ${JSON.stringify(overflowDetails.offenders)}`).toBeLessThanOrEqual(2);
      await expect(page.getByTestId('fatal-error-boundary')).toHaveCount(0);
      monitor.assertClean();
    }

    if (viewport.name === 'mobile') {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const menu = page.getByRole('button', { name: 'Open navigation menu' });
      await expect(menu).toBeVisible();
      await menu.click();
      await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
    }
  });
}
