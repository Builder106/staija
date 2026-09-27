import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5190';

const reporter = process.env.CI
  ? [['list'] as const, ['json', { outputFile: 'audit-output/accessibility.json' }] as const]
  : [['list'] as const, ['html', { outputFolder: 'audit-output/accessibility-report', open: 'never' }] as const];

export default defineConfig({
  testDir: './e2e',
  testMatch: /accessibility\.spec\.ts/,
  outputDir: 'test-results/accessibility-tests',
  fullyParallel: true,
  workers: Number(process.env.PLAYWRIGHT_A11Y_WORKERS ?? 1),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter,
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1',
        cwd: configDir,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
