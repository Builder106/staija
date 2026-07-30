# STAIJA Tier 3 trailer

The concept-first marketing trailer: 36s, 1920×1080@30fps, composition id
`StaijaTrailer`. Split out on 2026-07-19 from a combined project that used to
also hold the Tier 2 UI demo, which now lives at `../ui-demo/`. Beat structure
is in `STORYBOARD.md`.

## Build

```console
npm i
```

## Preview and render

```console
npm run dev
npm run render
```

The render lands at `out/staija-trailer.mp4` (gitignored). The pre-split final
render was backed up to `~/Documents/staija-tier3-trailer-BACKUP.mp4` before
this project was split out.

## Assets

`public/staija_phone_0001–0060.png` (the device sway loop) is gitignored: it's
78 MB of deterministic Blender output from `tools/device-render/phone.py`, so
the script is what we keep and a clean checkout needs a render before this
project will build. See that directory's README for the command. The screen
texture it renders is `public/staija_mobile.png`, captured by
`scratch/capture_mobile.js`.

`public/staija_stepup.png` and
`public/staija_dynamerge.png` are captured by `scratch/capture_programs.js`
(Puppeteer; `npm i` inside `scratch/` first).

See `STORYBOARD.md` for the "known unused assets" carried into
`scratch/unused-assets/` during the split — nothing was deleted, just parked.

## Music

`public/audio.mp3` is Kevin MacLeod's "Wholesome" (CC BY 4.0) — the credit
line in `public/CREDITS.md` must ship with any publish. Raw download sits at
`scratch/wholesome.mp3`.
