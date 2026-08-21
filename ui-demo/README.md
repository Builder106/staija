# STAIJA Tier 2 social cut

This 28-second, 1080×1920 social video is the Tier 2 STAIJA demo. It uses
real captures from staija.org and lives alongside the Tier 3 trailer in
`../trailer/`.

## Render

Run this on `ampere-dev`:

```console
npx --yes hyperframes@0.8.3 lint
npx --yes hyperframes@0.8.3 render --strict -o renders/staija-ui-demo.mp4
```

The render output is transient and should not be committed.

## Music

`public/audio.mp3` is Kevin MacLeod's "Wholesome" (CC BY 4.0). Keep the credit
in `public/CREDITS.md` with any published video.
