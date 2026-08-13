# E2E demo recordings

Playwright-BDD pipeline that drives the dev server through scripted user
journeys and captures each scenario as an MP4. The MP4s in
[`e2e/videos/`](./videos) are committed and embedded in the root README.

## Run

```bash

# Records every demo scenario, writes mp4s to e2e/videos/

npm run demo
```

The dev server is started automatically (`npm run dev` via Playwright's
`webServer` config). Recording is single-worker, headless, with
`slowMo: 1200` so the videos are watchable at 1× speed.

## Structure

```text
e2e/
├── demo/features/          Gherkin scenarios → one mp4 per scenario
│   ├── 00-warmup.feature   Throwaway runs that work around the
│   │                       0-byte first-test video bug
│   └── 01-public-tour.feature
├── steps/                  Step definitions (shared across features)
├── support/dwell.ts        DEMO-only sleep helper for "thing just appeared" beats
├── reporter.cjs            Custom video reporter (webm → mp4, drops warmups)
└── videos/                 Output, tracked in git
```

## Adding a new demo

1. Create `e2e/demo/features/NN-name.feature` (numeric prefix sets play

   order — Playwright runs alphabetically).

2. Reuse step phrases where possible; add new ones in `e2e/steps/`.
3. Anchor scenes with `dwellForDemo(page)` after every navigation or

   modal appearance — slowMo doesn't cover those.

4. Run `npm run demo`and commit the new`e2e/videos/<slug>.mp4`.

## Tuning

| Env var | Default | Effect |
| --- | --- | --- |
| `DEMO_SLOWMO` | `1200` | Per-action pause in ms |
| `DEMO_DWELL_MS` | `1500` | Default dwell duration |
| `DEMO_TAIL_MS` | `2500` | Hold-final-frame duration |

```bash

# Faster pace for quick iteration

DEMO_SLOWMO=600 DEMO_DWELL_MS=800 npm run demo
```

## Known quirks

- **The first one or two videos in a single-worker run can be 0 bytes.**

  The two warmup scenarios in `00-warmup.feature` absorb that, and the
  reporter discards their webms before the mp4 conversion step.

- **Don't switch to parallel workers as a "fix"** — multiple test

  contexts compete for the video subsystem and most or all videos end
  up 0 bytes.

- **Don't add cleanup hooks to demo scenarios.** API calls in `After`

  hooks race with Playwright's video finalization and can produce
  corrupted captures.
