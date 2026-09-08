import { expect, test } from '@playwright/test'

test.describe('public visitor journeys', () => {
  test('visitor navigates from home to stay connected', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/STAIJA/i)
    await page
      .getByRole('link', { name: /Not eligible yet, or between cycles\? Stay connected/i })
      .click()
    await expect(page).toHaveURL(/\/stay-connected/)
    await expect(
      page.getByRole('heading', { name: /Not applying right now\? Stay close anyway\./ }),
    ).toBeVisible()
  })

  test('visitor submits stay-connected interest without a provider call', async ({ page }) => {
    const newsletterRequests: string[] = []
    await page.route('**/*', async (route) => {
      if (/newsletter|mailgun|firebaseio|googleapis/.test(route.request().url())) {
        newsletterRequests.push(route.request().url())
        await route.abort()
        return
      }
      await route.continue()
    })

    await page.goto('/stay-connected?from=stepup-scholars&reason=closed')
    await expect(page.getByRole('heading', { name: /StepUp Scholars isn't open right now/i })).toBeVisible()
    await page.getByLabel('Email', { exact: true }).fill('visitor@example.com')
    await page.getByRole('button', { name: /Notify me/i }).click()
    await expect(page.getByText("You're on the list.", { exact: true })).toBeVisible()
    expect(newsletterRequests).toEqual([])
  })
})
