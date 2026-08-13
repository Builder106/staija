# Tier 3 trailer storyboard

Status: BUILT — composition `StaijaTrailer`, 1080 frames / 36s at 1920×1080@30fps.
Split out of the combined `trailer/` project on 2026-07-19, which used to also
hold the Tier 2 UI demo (now `../ui-demo/`); see `../ui-demo/STORYBOARD.md` for
that piece.

## Beats

| # | Frames | Scene | File |
| --- | -------- | ------- | ------ |
| 1 | 0–150 | The hook | `src/scenes/TheHook.tsx` |
| 2 | 150–270 | Mission | `src/scenes/Mission.tsx` |
| 3 | 270–480 | The solution | `src/scenes/TheSolution.tsx`— phone device shot, 60-frame ±18° sway loop from`public/staija_phone_*.png`(source:`tools/device-render/phone.py`) |
| 4 | 480–780 | Micro-interactions | `src/scenes/MicroInteractions.tsx` |
| 5 | 780–930 | The climax | `src/scenes/TheClimax.tsx` |
| 6 | 930–1080 | Outro | `src/scenes/Outro.tsx` |

## Audio

- Bed: Kevin MacLeod's "Wholesome" (CC BY 4.0) — trimmed into `public/audio.mp3`.

  Raw download sits at `scratch/wholesome.mp3`. Credit required on publish; see
  `public/CREDITS.md`.

- SFX: `sfx_whoosh.wav`(frame 450),`sfx_click.wav` (frames 558, 650),

  `sfx_chime.wav`(frame 735) — see the`<Audio>`sequences in`src/Composition.tsx`.

## Assets specific to this tier

- `public/staija_phone_0001–0060.png` — the device shot, rendered by

  `tools/device-render/phone.py`from`public/staija_mobile.png`. The sequence
  is gitignored; the script is the artifact. `public/phone.blend`, the
  hand-built model it replaces, was untracked and backed up to
  `~/Documents/staija-phone-BACKUP.blend`.

- `public/staija_stepup.png`, `public/staija_dynamerge.png` — program-page

  screenshots captured by `scratch/capture_programs.js` (a small Puppeteer
  script; `npm i`inside`scratch/` first).

## Known unused assets

`scratch/unused-assets/` holds material that survived the split but isn't wired
into either composition, carried forward rather than deleted:

- `staija_logo_sequence/` — a 60-frame logo sway sequence, same shape as the

  phone loop but never referenced by any scene. Likely an earlier attempt at an
  endcard treatment, abandoned in favor of the phone.

- `staija_mobile.png` and its capture script both left this folder when the

  phone render was scripted: the screenshot is now the screen texture at
  `public/staija_mobile.png`, and the script is `scratch/capture_mobile.js`.

- The pre-split project also had an unlabeled `out/video.mp4` with no tier or

  project info in the name; it was backed up to
  `~/Documents/staija-unlabeled-video-BACKUP.mp4` during the split and not
  carried into either new project's `out/`.
