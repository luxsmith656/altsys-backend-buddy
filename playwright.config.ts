import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // PostgreSQL .test.mjs files run through the required test:db command, not Playwright discovery.
  testMatch: '**/*.spec.ts',
  // Live write tests require separate, explicit consent and never run on a normal PR/build.
  testIgnore: '**/live/**',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Map canvases, video capture and live auth compete for memory on developer machines.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
