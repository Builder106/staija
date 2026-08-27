import { defineConfig, devices } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'

const testDir = defineBddConfig({
  features: 'e2e/demo/features/**/*.feature',
  steps: ['e2e/steps/**/*.ts'],
})

const SLOWMO = Number(process.env.DEMO_SLOWMO ?? (process.env.CI ? 500 : 1200))
const VIEWPORT = { width: 2560, height: 1600 }
const MOBILE_VIEWPORT = { width: 412, height: 915 }

export default defineConfig({
  testDir,
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['./e2e/reporter.cjs']],
  use: {
    headless: true,
    viewport: VIEWPORT,
    video: { mode: 'on', size: VIEWPORT },
    launchOptions: { slowMo: SLOWMO },
    baseURL: 'http://localhost:5190',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORT,
        video: { mode: 'on', size: VIEWPORT },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        viewport: MOBILE_VIEWPORT,
        video: { mode: 'on', size: MOBILE_VIEWPORT },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5190',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
