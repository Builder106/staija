import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(PUBLIC_DIR, 'brand');

const VARIANTS = [
  { name: 'staija-gradient', svg: path.join(PUBLIC_DIR, 'staija-gradient-wordmark.svg') },
  { name: 'staija-light', svg: path.join(PUBLIC_DIR, 'staija-wordmark-light.svg') },
  { name: 'staija-dark', svg: path.join(PUBLIC_DIR, 'staija-wordmark-dark.svg') },
] as const;

const WIDTHS = [180, 512, 1024, 2048] as const;

async function exportBrandAssets(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });

    for (const variant of VARIANTS) {
      if (!fs.existsSync(variant.svg)) {
        throw new Error(`Missing brand SVG: ${variant.svg}`);
      }
      const svgContent = fs.readFileSync(variant.svg, 'utf8');
      const aspectRatio = 506 / 2126;

      for (const width of WIDTHS) {
        const height = Math.max(1, Math.round(width * aspectRatio));
        await page.setViewportSize({ width, height });
        await page.setContent(
          `<!doctype html><html><body style="margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;width:${width}px;height:${height}px;">${svgContent.replace(/width="[^"]*"/, `width="${width}"`).replace(/height="[^"]*"/, `height="${height}"`)}</body></html>`,
        );
        const outPath = path.join(OUT_DIR, `${variant.name}-${width}w.png`);
        await page.screenshot({ path: outPath, omitBackground: true });
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`Exported brand assets to ${path.relative(ROOT, OUT_DIR)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportBrandAssets().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { exportBrandAssets, VARIANTS, WIDTHS };
