# STAIJA Tier 3 trailer

This 36-second, 1920×1080 concept trailer is the Tier 3 STAIJA video. It uses
HyperFrames and the tracked mobile/program captures, rather than an untracked
Blender frame sequence.

## Render

Run this on `ampere-dev`:

```console
npx --yes hyperframes@0.8.3 lint
npx --yes hyperframes@0.8.3 render --strict -o renders/staija-trailer.mp4
```

The render output is transient and should not be committed.

## Music

`public/audio.mp3` is Kevin MacLeod's "Wholesome" (CC BY 4.0). Keep the credit
in `public/CREDITS.md` with any published video.
