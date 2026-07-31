#!/usr/bin/env node
/**
 * Render tools/social/repo-card.html to repo-card.png at 1280×640.
 *
 * Output gets uploaded to Settings → Social preview on
 * github.com/Builder106/staija. GitHub recommends 1280×640; the
 * template safe-area is 40pt all around (already respected by the
 * HTML's padding).
 *
 * Run: `npm run social:capture`
 */
const path = require('path')
const { chromium } = require('playwright')

const HERE = __dirname
const HTML = path.join(HERE, 'repo-card.html')
const OUT = path.join(HERE, 'repo-card.png')

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 2, // retina-sharp source; GitHub still serves it well
  })
  const page = await context.newPage()

  await page.goto('file://' + HTML, { waitUntil: 'networkidle' })
  // Belt-and-suspenders: wait for webfonts so the wordmark doesn't
  // render in the system fallback during the screenshot.
  await page.evaluate(() => document.fonts.ready)

  await page.screenshot({
    path: OUT,
    type: 'png',
    omitBackground: false,
    clip: { x: 0, y: 0, width: 1280, height: 640 },
  })

  await browser.close()
  console.log(`Wrote ${OUT}`)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
