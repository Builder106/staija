# Tier 2 UI demo storyboard

Status: BUILT — composition `StaijaUIDemo`, 1350 frames / 45s at 1920×1080@30fps.
Split out of the combined `trailer/` project on 2026-07-19 (that project is now
Tier-3-only at `../trailer/`; see `../trailer/STORYBOARD.md`).

## Beats

| # | Frames | Beat | On screen | Scene |
| --- | -------- | ------ | ----------- | ------- |
| 1 | 0–90 | Title card | | `src/scenes/UITitle.tsx` |
| 2 | 90–330 | Home | "One front door." — programs, stories, and community from the first scroll | `src/Composition.tsx` (`BrowserScene`, `staija_ui_home.png`) |
| 3 | 330–540 | StepUp Scholars | "StepUp Scholars." — the Nigeria-based research incubator | `src/Composition.tsx` (`BrowserScene`, `staija_ui_programs_stepup_scholars.png`) |
| 4 | 540–750 | Dynamerge | "Dynamerge." — the pan-African virtual summer bootcamp | `src/Composition.tsx` (`BrowserScene`, `staija_ui_programs_dynamerge.png`) |
| 5 | 750–990 | Community montage | events / about / get-involved / stay-connected | `src/scenes/UIMontage.tsx` |
| 6 | 990–1170 | Signup | "Join in minutes." | `src/Composition.tsx` (`BrowserScene`, `staija_ui_signup.png`) |
| 7 | 1170–1350 | Outro | | `src/scenes/UIOutro.tsx` |

## Audio

- Bed: Kevin MacLeod's "Wholesome" (CC BY 4.0) — trimmed into `public/audio.mp3`
  (a separate trim from the Tier 3 trailer's own `audio.mp3`; both derive from
  the same source track, `../trailer/scratch/wholesome.mp3`). Credit required
  on publish; see `public/CREDITS.md`.
- SFX: `sfx_whoosh.wav` at every scene cut (frames 90/330/540/750/990),
  `sfx_chime.wav` as the outro card lands (frame 1190).

## Assets specific to this tier

`public/staija_ui_*.png` are full-page authenticated screenshots of
staija.org. Referenced by the composition: `home`, `programs_stepup_scholars`,
`programs_dynamerge`, `signup` (main sequence), plus `about`, `get_involved`,
`stay_connected` (montage). `blog`, `contact`, `events`, `login`, `press` were
captured alongside the rest but are **not currently wired into any beat** —
kept in `public/` since they're clearly part of this tier's asset family, not
true orphans, in case a future re-cut wants them.
