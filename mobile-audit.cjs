// One-off mobile responsiveness audit. Visits routes at a phone viewport,
// screenshots them, and flags horizontal overflow + any elements wider than
// the viewport (the most common source of mobile layout bugs).

const { chromium, devices } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const ROUTES = [
  '/',
  '/about',
  '/events',
  '/press',
  '/contact',
  '/donate',
  '/blog',
  '/programs/stepup-scholars',
  '/programs/dynamerge',
  '/apply',
];

const VIEWPORTS = [
  { name: 'iphone-13', vp: devices['iPhone 13'] },
  { name: 'pixel-7', vp: devices['Pixel 7'] },
];

const OUT = '/tmp/staija-mobile';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const findings = [];

  for (const { name, vp } of VIEWPORTS) {
    const context = await browser.newContext({ ...vp, baseURL: 'http://localhost:5190' });
    const page = await context.newPage();

    for (const route of ROUTES) {
      const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
      try {
        await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        // networkidle is unreliable on routes that hold open Firestore listeners.
        await page.waitForLoadState('load', { timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(800); // let entrance motion settle and CMS-driven sections render
      } catch (e) {
        findings.push({ viewport: name, route, error: `nav: ${e.message}` });
        continue;
      }

      const overflow = await page.evaluate((vw) => {
        const out = [];
        const docW = document.documentElement.scrollWidth;
        const clientW = document.documentElement.clientWidth;
        const horizontalScroll = docW > clientW + 1;
        // Find every element that overflows the viewport horizontally.
        const culprits = [];
        document.querySelectorAll('*').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 1 && r.width > 4) {
            culprits.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(
                0,
                80,
              ),
              right: Math.round(r.right),
              width: Math.round(r.width),
            });
          }
        });
        // Cap to most significant offenders to avoid log noise.
        culprits.sort((a, b) => b.right - a.right);
        return {
          docW,
          clientW,
          horizontalScroll,
          culprits: culprits.slice(0, 6),
        };
      }, vp.viewport.width);

      await page.screenshot({
        path: path.join(OUT, `${name}-${slug}.png`),
        fullPage: true,
      });

      findings.push({
        viewport: name,
        route,
        docW: overflow.docW,
        clientW: overflow.clientW,
        horizontalScroll: overflow.horizontalScroll,
        culprits: overflow.culprits,
      });
    }

    await context.close();
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(findings, null, 2));
  // Concise stdout summary.
  for (const f of findings) {
    if (f.error) {
      console.log(`[${f.viewport}] ${f.route} — ERROR: ${f.error}`);
      continue;
    }
    const flag = f.horizontalScroll ? '⚠️  OVERFLOW' : 'ok';
    console.log(`[${f.viewport}] ${f.route} ${f.docW}/${f.clientW}  ${flag}`);
    if (f.horizontalScroll) {
      for (const c of f.culprits) {
        console.log(`    → ${c.tag}.${c.cls}  right=${c.right} w=${c.width}`);
      }
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
