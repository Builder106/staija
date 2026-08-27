import { defineConfig, devices } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'

const testDir = defineBddConfig({
  features: 'e2e/demo/features/**/*.feature',
  steps: ['e2e/steps/**/*.ts'],
})

const SLOWMO = Number(process.env.DEMO_SLOWMO ?? (process.env.CI ? 500 : 1200))
const DEMO_PORT = Number(process.env.DEMO_PORT ?? 5190)
const DEMO_ORIGIN = `http://localhost:${DEMO_PORT}`
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
    baseURL: DEMO_ORIGIN,
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
        // Mobile runs the same user journeys as a responsive regression
        // check. Keep recordings to the desktop project so each scenario
        // produces one stable documentation artifact.
        video: 'off',
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${DEMO_PORT}`,
    url: DEMO_ORIGIN,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
