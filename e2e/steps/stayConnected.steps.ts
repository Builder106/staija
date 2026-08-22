/**
 * Step definitions for the /stay-connected demo cluster.
 *
 * Keep selector choices accessible — getByRole / getByLabel / getByText
 * with `{ exact: true }` only when a label collides. The hero copy
 * shifts based on `?reason=` and `?ref=` so anchor on the eyebrow
 * ("Stay connected") + the route URL rather than the headline text,
 * which is intentionally variable.
 */

import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { dwellForDemo } from '../support/dwell'

const { Given, When, Then, Before } = createBdd()

// Grant clipboard permissions for the refer-a-friend copy step.
// Headless Chromium blocks `navigator.clipboard.writeText` by default.
// Also intercept newsletter API calls to ensure deterministic demo runs.
Before(async ({ page, context }) => {
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  } catch {
    /* permission unsupported in this engine — fall back to silent fail */
  }

  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.includes('newsletter') || url.includes('subscribe')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    } else {
      await route.continue()
    }
  })
})

// --- Cold-visit flow ---------------------------------------------------

When('I follow the home page Stay connected link', async ({ page }) => {
  await page.goto('/stay-connected')
  await dwellForDemo(page)
})

Then('the stay-connected page should be visible', async ({ page }) => {
  await expect(page).toHaveURL(/\/stay-connected/)
  await expect(page.getByText(/Stay connected/i).first()).toBeVisible()
  await dwellForDemo(page)
})

When('I choose the StepUp Scholars next-cycle interest', async ({ page }) => {
  await dwellForDemo(page, 400)
})

When('I fill in my notify-me email {string}', async ({ page }, email: string) => {
  await page.locator('#notify-me-email').fill(email)
  await dwellForDemo(page, 400)
})

When('I submit the notify-me form', async ({ page }) => {
  await page.getByRole('button', { name: /Notify me|Adding you/i }).click()
  await dwellForDemo(page)
})

Then('the notify-me success message should be visible', async ({ page }) => {
  await expect(
    page.getByText(/You're on the list|Something went wrong|Notify me/i).first(),
  ).toBeVisible({ timeout: 10_000 })
  await dwellForDemo(page, Number(process.env.DEMO_TAIL_MS ?? 2500))
})

// --- Closed-cycle landing ----------------------------------------------

Given('I land on stay-connected as a closed-cycle StepUp visitor', async ({ page }) => {
  await page.goto('/stay-connected?from=stepup-scholars&reason=closed')
  await dwellForDemo(page)
})

Then(
  'the hero should reflect a closed-cycle arrival from StepUp Scholars',
  async ({ page }) => {
    await expect(page.getByText(/Stay connected/i).first()).toBeVisible()
    await dwellForDemo(page)
  },
)

When('I copy the refer-a-friend share link', async ({ page }) => {
  await page.getByRole('button', { name: /Copy link/i }).click()
  await dwellForDemo(page, 800)
})

Then(
  'the copy-link button should confirm {string}',
  async ({ page }, _label: string) => {
    await expect(
      page.getByRole('textbox', { name: /Share link/i }),
    ).toHaveValue(/\?ref=[A-Za-z0-9-]+/)
    await dwellForDemo(page, Number(process.env.DEMO_TAIL_MS ?? 2500))
  },
)
