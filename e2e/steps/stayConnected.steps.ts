/**
 * Step definitions for the /stay-connected demo cluster.
 */

import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { dwellForDemo } from '../support/dwell'

const { Given, When, Then, Before } = createBdd()

Before(async ({ context }) => {
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  } catch {
    /* permission unsupported in this engine */
  }
})

// --- Cold-visit flow ---------------------------------------------------

When('I follow the home page Stay connected link', async ({ page }) => {
  await page
    .getByRole('link', { name: /Not eligible yet, or between cycles\? Stay connected/i })
    .click()
  await page.getByRole('heading', { name: /Not applying right now\? Stay close anyway\./ }).waitFor()
  await dwellForDemo(page)
})

Then('the stay-connected page should be visible', async ({ page }) => {
  await expect(page).toHaveURL(/\/stay-connected/)
  await expect(
    page.getByRole('heading', { name: /Not applying right now\? Stay close anyway\./ }),
  ).toBeVisible()
  await dwellForDemo(page)
})

When('I choose the StepUp Scholars next-cycle interest', async ({ page }) => {
  await page.getByRole('button', { name: 'Just general STAIJA updates', exact: true }).click()
  await page
    .getByRole('option', { name: 'StepUp Scholars — next cycle', exact: true })
    .click()
  await dwellForDemo(page, 400)
})

When('I fill in my notify-me email {string}', async ({ page }, email: string) => {
  await page.getByLabel('Email', { exact: true }).fill(email)
  await dwellForDemo(page, 400)
})

When('I submit the notify-me form', async ({ page }) => {
  await page.getByRole('button', { name: 'Notify me', exact: true }).click()
  await expect(page.getByText("You're on the list.", { exact: true })).toBeVisible()
  await dwellForDemo(page)
})

Then('the notify-me success message should be visible', async ({ page }) => {
  await expect(page.getByText("You're on the list.", { exact: true })).toBeVisible()
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
    await expect(
      page.getByRole('heading', { name: "StepUp Scholars isn't open right now." }),
    ).toBeVisible()
    await dwellForDemo(page)
  },
)

When('I copy the refer-a-friend share link', async ({ page }) => {
  await page.getByRole('button', { name: 'Copy link', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  await dwellForDemo(page, 800)
})

Then(
  'the copy-link button should confirm {string}',
  async ({ page }, _label: string) => {
    await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
    await dwellForDemo(page, Number(process.env.DEMO_TAIL_MS ?? 2500))
  },
)
