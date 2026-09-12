import { expect, test } from '@playwright/test';
import { installGuideFixture, monitorGuideFixture } from '../support/guide-fixture';

test('Kali listens, thinks during the real request, and reacts to the reply safely', async ({ page }, testInfo) => {
  const monitor = monitorGuideFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installGuideFixture(page);
  let release: () => void = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  let requestBody: { booking_context: { viewer_role: string; current_page: string } } | undefined;
  let requestCount = 0;
  await page.route('**/functions/v1/trail-chat-rag', async (route) => {
    requestCount++;
    requestBody = route.request().postDataJSON();
    await ready;
    const content = 'A storm warning means you should reschedule. <img src=x onerror="window.unsafeKali=true">';
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await page.goto('/guide');
  await page.getByRole('button', { name: 'Open quick actions' }).click();
  await page.getByRole('button', { name: 'Ask Kali AI', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'Chat with Kali' });
  await expect(chat.getByText('How do I accept an assignment?', { exact: true })).toBeVisible();
  await chat.getByRole('textbox', { name: 'Ask Kali' }).fill('Can I still go hiking?');
  await expect(chat.locator('[data-activity="listening"]').first()).toBeVisible();
  await chat.getByRole('button', { name: 'Send message' }).click();
  await expect.poll(() => requestCount).toBe(1);
  expect(requestBody?.booking_context.viewer_role).toBe('guide');
  expect(requestBody?.booking_context.current_page).toContain('Guide Dashboard');
  await expect(chat.locator('[data-activity="thinking"]').first()).toBeVisible();
  await expect(chat.getByRole('button', { name: 'Send message' })).toBeDisabled();
  release();
  await expect(chat.getByText(/A storm warning means/)).toBeVisible();
  await expect(chat.getByRole('img', { name: 'Kali alert expression' }).first()).toBeVisible();
  expect(await page.evaluate(() => 'unsafeKali' in window)).toBe(false);
  await expect(chat.locator('img[src="x"]')).toHaveCount(0);
  await expect(chat.getByRole('textbox', { name: 'Ask Kali' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('kali-mobile.png') });
  await chat.getByRole('button', { name: 'Close chat' }).click();
  await expect(chat).toHaveCount(0);
  expect(requestCount).toBe(1);
  monitor.assertClean();
});

test('the full chat page uses the same animated Kali and honors reduced motion', async ({ page }, testInfo) => {
  const monitor = monitorGuideFixture(page);
  await installGuideFixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/chat');
  await page.getByRole('textbox', { name: 'Ask Kali' }).fill('Hello Kali');
  const avatar = page.getByRole('img', { name: 'Kali listening expression' });
  await expect(avatar).toBeVisible();
  await expect(avatar.locator('.kali-portrait')).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('button', { name: 'How do I accept an assignment?' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('kali-desktop.png') });
  monitor.assertClean();
});

test('full chat replies fit beside Kali on a small phone', async ({ page }, testInfo) => {
  const monitor = monitorGuideFixture(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await installGuideFixture(page);
  await page.route('**/functions/v1/trail-chat-rag', (route) => route.fulfill({
    contentType: 'text/event-stream',
    body: 'data: ' + JSON.stringify({ choices: [{ delta: {
      content: 'To share your referral, copy the link from your dashboard. [Your referral](https://example.test/booking?guide=guide-preview)\n\n' + 'VeryLongReference'.repeat(20),
    } }] }) + '\n\ndata: [DONE]\n\n',
  }));
  await page.goto('/chat');
  await page.getByRole('textbox', { name: 'Ask Kali' }).fill('How do I share my referral?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('link', { name: 'Your referral' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const message = page.getByText(/VeryLongReference/);
  expect(await message.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Ask Kali' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('kali-full-chat-mobile.png') });
  monitor.assertClean();
});
