// Captures short, seamlessly-looping video clips for the UI-demo's animated
// components (currently: the Dynamerge country marquee and the Home hero
// headline). Unlike capture.mjs's full-page screenshots, these don't need
// re-running on every UI change — only when the animated component's
// markup or timing changes.
//
// Two loop strategies, picked per target via `mode`:
//   - "exact": the CSS animation has a single, known, linear period
//     (e.g. the marquee's `animation: marquee-scroll 36s linear infinite`).
//     Trimming any window of exactly that length loops seamlessly,
//     regardless of what phase the recording happened to start at.
//   - "crossfade": multiple overlapping animations with no practical
//     common period (the hero's three staggered idle-hop icons plus the
//     idle-float/idle-sheen sweep only realign every ~126s). Instead of
//     chasing an exact loop, record `recordSeconds`, then ffmpeg
//     crossfades the last `overlapSeconds` into the first `overlapSeconds`
//     and reorders the result so the blended segment sits at the loop
//     boundary — output plays: [content after the blended-in head] ->
//     [tail crossfading into head] -> loops back to start. Not a
//     mathematically perfect loop, just a seam small enough (small-
//     amplitude motion, short overlap) not to read as a cut.
//
// Requires ffmpeg on PATH (or FFMPEG_PATH env var).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../ui-demo/public');
const baseUrl = process.env.CAPTURE_BASE_URL ?? 'https://staija.org';

// Must match capture.mjs's viewport — loop clips are composited over the
// full-page screenshots in the same 1600-wide coordinate space.
const VIEWPORT = { width: 1600, height: 1000 };
const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
// NOTE: unlike page.screenshot(), Playwright's recordVideo does NOT honor
// deviceScaleFactor for actual capture resolution — verified empirically:
// requesting a size larger than the viewport just pads the native-res
// content with blank canvas rather than upscaling it, and omitting size
// downscales to fit 800x800. Video capture is hard-capped to native CSS
// viewport pixels, so there's no supersampling lever here. Keep at 1x.
const CAPTURE_SCALE = 1;

const targets = [
  {
    name: 'dynamerge_marquee',
    path: '/programs/dynamerge',
    selector: '.marquee',
    mode: 'exact',
    periodSeconds: 36,
    out: 'staija_ui_dynamerge_marquee_loop.mp4',
  },
  {
    name: 'home_hero',
    path: '/',
    selector: 'h1',
    mode: 'crossfade',
    recordSeconds: 9,
    overlapSeconds: 1,
    out: 'staija_ui_home_hero_loop.mp4',
  },
];

function even(n) {
  return n % 2 === 0 ? n : n - 1;
}

function cropFilter(box) {
  const w = even(Math.round(box.width * CAPTURE_SCALE));
  const h = even(Math.round(box.height * CAPTURE_SCALE));
  const x = Math.round(box.x * CAPTURE_SCALE);
  const y = Math.round(box.y * CAPTURE_SCALE);
  return `crop=${w}:${h}:${x}:${y}`;
}

function encodeExact(ffmpegPath, rawPath, box, target, outPath, seekSeconds) {
  execFileSync(ffmpegPath, [
    '-y',
    '-ss', seekSeconds.toFixed(3),
    '-i', rawPath,
    '-t', String(target.periodSeconds),
    '-vf', cropFilter(box),
    '-r', '30',
    '-an',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    outPath,
  ], { stdio: 'inherit' });
}

function encodeCrossfade(ffmpegPath, rawPath, box, target, outPath, seekSeconds) {
  const { recordSeconds: L, overlapSeconds: overlap } = target;
  const middleEnd = L - overlap;
  const filter = [
    // A filtergraph link can only feed one downstream consumer, so the
    // cropped source is explicitly split into three copies (used by the
    // middle/tail/head trims below) rather than referencing [cropped]
    // three times directly.
    `[0:v]${cropFilter(box)},fps=30,split=3[c1][c2][c3]`,
    `[c1]trim=start=${overlap}:end=${middleEnd},setpts=PTS-STARTPTS[middle]`,
    `[c2]trim=start=${middleEnd}:end=${L},setpts=PTS-STARTPTS[tail]`,
    `[c3]trim=start=0:end=${overlap},setpts=PTS-STARTPTS[head]`,
    `[tail][head]xfade=transition=fade:duration=${overlap}:offset=0[bridge]`,
    `[middle][bridge]concat=n=2:v=1:a=0[outv]`,
  ].join(';');

  execFileSync(ffmpegPath, [
    '-y',
    '-ss', seekSeconds.toFixed(3),
    '-i', rawPath,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-an',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    outPath,
  ], { stdio: 'inherit' });
}

async function captureOne(browser, target) {
  const videoDir = mkdtempSync(path.join(tmpdir(), 'ui-demo-loop-'));
  // Playwright's recordVideo starts capturing from context/page creation —
  // including the blank pre-navigation frame and the whole page-load
  // sequence — not from whenever we happen to consider the page "ready."
  // `contextCreatedAt` lets us measure exactly how much of the raw file is
  // that loading prefix, so ffmpeg can seek past it instead of assuming
  // the clean footage starts at the raw file's t=0.
  const contextCreatedAt = Date.now();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: CAPTURE_SCALE,
    recordVideo: {
      dir: videoDir,
      size: { width: VIEWPORT.width * CAPTURE_SCALE, height: VIEWPORT.height * CAPTURE_SCALE },
    },
  });
  const page = await context.newPage();

  const url = new URL(target.path, baseUrl).toString();
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  // `waitUntil: 'load'` only covers the initial document/JS fetch — Vue
  // mounts and paints (fonts, gradient backgrounds) afterward, so without
  // this settle window the first second or so of the recording catches a
  // still-unstyled page (seen as a flash of unstyled pale background
  // where the hero gradient/text should be).
  await page.waitForTimeout(2000);

  const box = await page.locator(target.selector).boundingBox();
  if (!box) {
    throw new Error(`selector "${target.selector}" not found on ${url}`);
  }

  const seekSeconds = (Date.now() - contextCreatedAt) / 1000;

  // Real elapsed time drives the trim/xfade math below, not frame count,
  // since the source capture's frame rate isn't guaranteed stable.
  const recordSeconds = target.mode === 'exact' ? target.periodSeconds : target.recordSeconds;
  const recordStart = Date.now();
  await page.waitForTimeout(recordSeconds * 1000);
  const recordedMs = Date.now() - recordStart;

  const video = page.video();
  await context.close(); // flushes the webm to disk
  const rawPath = await video.path();

  const outPath = path.join(outDir, target.out);
  if (target.mode === 'exact') {
    encodeExact(ffmpegPath, rawPath, box, target, outPath, seekSeconds);
  } else {
    encodeCrossfade(ffmpegPath, rawPath, box, target, outPath, seekSeconds);
  }

  rmSync(videoDir, { recursive: true, force: true });

  const outSeconds = target.mode === 'exact' ? target.periodSeconds : target.recordSeconds - target.overlapSeconds;
  console.log(
    `${target.out}: ${box.width}x${box.height} @ (${box.x},${box.y}), ` +
    `seeked past ${seekSeconds.toFixed(2)}s loading prefix, recorded ${(recordedMs / 1000).toFixed(2)}s, ` +
    `output ${outSeconds}s (${target.mode})`,
  );
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  // Optional: node capture-loops.mjs home_hero dynamerge_marquee — restrict
  // to specific targets by name instead of re-capturing everything.
  const requested = process.argv.slice(2);
  const selected = requested.length
    ? targets.filter((t) => requested.includes(t.name))
    : targets;

  for (const target of selected) {
    try {
      await captureOne(browser, target);
    } catch (err) {
      console.error(`FAILED ${target.name}: ${err.message}`);
    }
  }

  await browser.close();
}

main();
