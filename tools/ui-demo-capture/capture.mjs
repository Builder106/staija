// Recaptures the static screenshots that ui-demo/ (Tier 2 Remotion demo)
// pans/zooms over. Run this after any UI change to a page listed below,
// then compare dimensions against ui-demo/src/Composition.tsx's
// imgWidth/imgHeight props — update those if they drifted.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../ui-demo/public');

const baseUrl = process.env.CAPTURE_BASE_URL ?? 'https://staija.org';

// Keep this list in sync with the Sequence entries in
// ui-demo/src/Composition.tsx and ui-demo/src/scenes/UIMontage.tsx.
const pages = [
  { path: '/', out: 'staija_ui_home.png' },
  { path: '/programs/stepup-scholars', out: 'staija_ui_programs_stepup_scholars.png' },
  { path: '/programs/dynamerge', out: 'staija_ui_programs_dynamerge.png' },
  { path: '/about', out: 'staija_ui_about.png' },
  { path: '/get-involved', out: 'staija_ui_get_involved.png' },
  { path: '/stay-connected', out: 'staija_ui_stay_connected.png' },
  { path: '/signup', out: 'staija_ui_signup.png' },
  { path: '/login', out: 'staija_ui_login.png' },
  { path: '/contact', out: 'staija_ui_contact.png' },
  { path: '/press', out: 'staija_ui_press.png' },
  { path: '/events', out: 'staija_ui_events.png' },
  { path: '/blog', out: 'staija_ui_blog.png' },
];

// The site's scroll-reveal sections (Vue `<Motion whileInView>`, e.g. the
// Home "Two paths to accelerated impact" cards) toggle opacity based on
// *live* IntersectionObserver state rather than latching permanently once
// shown — confirmed interactively: scrolling a hidden card into view flips
// it to opacity 1, but scrolling back to the top (needed before a fullPage
// screenshot) resets it straight back to opacity 0. So there is no scroll
// sequence that leaves every section visible at once for a single
// screenshot. Instead of fighting the scroll-triggered state machine,
// force every still-hidden Motion element directly to its revealed
// end-state right before the screenshot.
//
// Order matters here: all settling (the scroll loop + its wait) must
// happen BEFORE the override, and the screenshot must follow the override
// immediately with no wait in between. IntersectionObserver callbacks are
// async — scrolling back to 0 queues a "no longer intersecting" callback
// that hadn't fired yet when the override runs; a wait placed *after* the
// override gives that stale callback time to fire and Vue reactively
// stomps the override straight back to opacity 0.
async function triggerScrollReveal(page) {
  await page.evaluate(async () => {
    const step = 400;
    const height = document.body.scrollHeight;
    for (let y = 0; y < height; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  // Generous settle window — staggered card reveals (per-index delay, e.g.
  // Dynamerge's week cards) and any pending IntersectionObserver callbacks
  // need this to finish before the override below, not after.
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    // Motion's `initial` state isn't always opacity-based — e.g. StepUp's
    // timeline spine uses `:initial="{ scaleY: 0 }"` with no opacity in its
    // style at all (a collapsed line, not a faded one), so it needs its
    // own selector or it's invisible in every capture.
    const selector = [
      '[style*="opacity: 0"]',
      '[style*="scaleY(0)"]',
      '[style*="scaleX(0)"]',
      '[style*="scale(0)"]',
    ].join(', ');
    document.querySelectorAll(selector).forEach((el) => {
      el.style.setProperty('opacity', '1');
      el.style.setProperty('transform', 'none');
    });
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  // A narrower viewport than desktop-ultrawide (2560) so the captured UI
  // reads at a readable size once scaled down into the browser-chrome
  // mockup in the Remotion composition — at 2560 the mockup crushed
  // everything down to near-illegible text. deviceScaleFactor:2 captures
  // at retina pixel density — the screenshot is still displayed at the
  // same CSS width in the composition (BrowserScene sets an explicit
  // style.width), so this is pure supersampling: sharper text/edges after
  // the downscale, no layout changes needed anywhere else.
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });

  for (const { path: urlPath, out } of pages) {
    const url = new URL(urlPath, baseUrl).toString();
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(1000);
      // The site header is `position: sticky`. Playwright's fullPage
      // screenshot stitches the page in viewport-sized tiles, and a sticky
      // element gets baked into whichever tile it happened to be "stuck"
      // in at capture time — showing up as a phantom header partway down
      // the page instead of only at the top. Neutralizing it to `static`
      // for the screenshot removes the stuck state entirely.
      await page.addStyleTag({ content: 'header.sticky { position: static !important; }' });
      await triggerScrollReveal(page);

      const outPath = path.join(outDir, out);
      await page.screenshot({ path: outPath, fullPage: true });

      const box = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      console.log(`${out}: ${box.w}x${box.h}  (${url})`);
    } catch (err) {
      console.error(`FAILED ${out} (${url}): ${err.message}`);
    }
  }

  await browser.close();
}

main();
