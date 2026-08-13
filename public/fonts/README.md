# Self-hosted web fonts

These woff2 files back the `@font-face` block in [`src/styles/fonts.css`](../../src/styles/fonts.css). They were downloaded from `fonts.gstatic.com` once and committed so the production site doesn't have to round-trip through Google's CDN on every cold load.

## Regeneration

Run from the repo root. Requires `curl`and`sed`.

```bash

# 1. Fetch the Google Fonts stylesheet with a modern UA so it serves

#    woff2 URLs (an older UA gets woff, which is larger)

curl -sL \
  -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap' \
  -o /tmp/staija-fonts.css

# 2. Download each unique woff2 URL into public/fonts/

grep -oE 'https://fonts.gstatic.com/[^)]*\.woff2' /tmp/staija-fonts.css \
  | sort -u \
  | while IFS= read -r url; do
      curl -sL "$url" -o "public/fonts/$(basename "$url")"
    done

# 3. Rewrite the CSS to point at the local files, then splice the

#    result into the bottom of src/styles/fonts.css below the

#    "Self-hosted web fonts (generated)" marker line. The fallback

#    @font-face blocks above the marker are hand-maintained — don't

#    overwrite them

sed -E \
  's|https://fonts\.gstatic\.com/[^)]*/([^/]+\.woff2)|/fonts/\1|g' \
  /tmp/staija-fonts.css \
  > /tmp/staija-fonts-rewritten.css

# Then manually replace everything after the marker comment in

# src/styles/fonts.css with the contents of the rewritten file

```

## When to regenerate

- A new font weight is added to the design.
- Google ships a new version of one of the families (rare; tracked by the `v<n>` path segment in URLs).
- Stale woff2 files are removed accidentally.

If a preload link in [`index.html`](../../index.html) 404s after regen, the file hash for IBM Plex Sans 700 latin has changed — find the new hash in the rewritten CSS and update the `<link rel="preload" href="...">` to match.

## Ojuju (the two `Ojuju-*-subset.woff2` files)

These didn't come from the Google Fonts CDN pipeline above — Ojuju is a variable font, so it needed `fonttools` (instancer + subset + woff2 compress), not a CSS-endpoint fetch. See [`docs/TYPOGRAPHY-SYSTEM.md`](../../docs/TYPOGRAPHY-SYSTEM.md) for why it was added and [`src/styles/fonts.css`](../../src/styles/fonts.css) for the `@font-face` blocks that reference them.

Regeneration (run on `ampere-dev`, not this Mac — `pip install fonttools`materializes a`.venv`):

```bash
curl -sL -o 'Ojuju[wght].ttf' 'https://github.com/google/fonts/raw/main/ofl/ojuju/Ojuju%5Bwght%5D.ttf'
fonttools varLib.instancer -o Ojuju-Medium500.ttf 'Ojuju[wght].ttf' wght=500
fonttools varLib.instancer -o Ojuju-ExtraBold800.ttf 'Ojuju[wght].ttf' wght=800
for f in Ojuju-Medium500 Ojuju-ExtraBold800; do
  fonttools subset "$f.ttf" --output-file="$f-subset.ttf" \
    --unicodes='U+0020-007E,U+00A0-024F,U+1E00-1EFF,U+2018,U+2019,U+201C,U+201D,U+2013,U+2014,U+2026' \
    --layout-features='*' --glyph-names --symbol-cmap --legacy-cmap \
    --notdef-glyph --notdef-outline --recommended-glyphs \
    --name-IDs='*' --name-legacy --name-languages='*'
  fonttools ttLib.woff2 compress -o "$f-subset.woff2" "$f-subset.ttf"
done
```

Copy the two `*-subset.woff2`outputs into`public/fonts/`, keeping the same filenames (`src/styles/fonts.css` references them by name, not hash).

## Madimi One (single static weight, no CDN pipeline)

Same reasoning as Ojuju above — not on the Google Fonts CDN pipeline — but simpler, since it ships as a single static weight with no variable axis, so there's no `varLib.instancer` step.

Regeneration (run on `ampere-dev`, not this Mac):

```bash
curl -sL -o MadimiOne-Regular.ttf 'https://github.com/google/fonts/raw/main/ofl/madimione/MadimiOne-Regular.ttf'
fonttools subset MadimiOne-Regular.ttf --output-file=MadimiOne-Regular-subset.ttf \
  --unicodes='U+0020-007E,U+00A0-024F,U+1E00-1EFF,U+2018,U+2019,U+201C,U+201D,U+2013,U+2014,U+2026' \
  --layout-features='*' --glyph-names --symbol-cmap --legacy-cmap \
  --notdef-glyph --notdef-outline --recommended-glyphs \
  --name-IDs='*' --name-legacy --name-languages='*'
fonttools ttLib.woff2 compress -o MadimiOne-Regular-subset.woff2 MadimiOne-Regular-subset.ttf
```

Copy `MadimiOne-Regular-subset.woff2`into`public/fonts/`.

## Agu Display (variable font, instanced to a single static weight)

Same idea as Ojuju's `varLib.instancer` step, but instanced at the source's default axis value rather than a custom one — this token (`--font-accent-african-tertiary`) only ever needs one static weight, so there's no reason to cut multiple instances the way Ojuju's 500/800 split was.

```bash
curl -sL -o AguDisplay.ttf 'https://github.com/google/fonts/raw/main/ofl/agudisplay/AguDisplay%5BMORF%5D.ttf'
fonttools varLib.instancer -o AguDisplay-Default.ttf AguDisplay.ttf MORF=0
fonttools subset AguDisplay-Default.ttf --output-file=AguDisplay-Regular-subset.ttf \
  --unicodes='U+0020-007E,U+00A0-024F,U+1E00-1EFF,U+2018,U+2019,U+201C,U+201D,U+2013,U+2014,U+2026' \
  --layout-features='*' --glyph-names --symbol-cmap --legacy-cmap \
  --notdef-glyph --notdef-outline --recommended-glyphs \
  --name-IDs='*' --name-legacy --name-languages='*'
fonttools ttLib.woff2 compress -o AguDisplay-Regular-subset.woff2 AguDisplay-Regular-subset.ttf
```

Copy `AguDisplay-Regular-subset.woff2`into`public/fonts/`.

**Note:** `Matemasie-Regular-subset.woff2`is a leftover from when`--font-accent-african-tertiary`pointed at Matemasie instead of Agu Display — its`@font-face` blocks and CSS references were removed when the token was repointed, but the file itself is still sitting in this directory unused (file deletion wasn't available in that session). Safe to delete.

The `'Agu Display Fallback'`/`'Madimi One Fallback'` `size-adjust`/`ascent-override`/`descent-override`values in`src/styles/fonts.css`aren't from this pipeline — they're hand-derived from the font's own`hhea`/`OS/2` tables. The formula, reverse-derived from the existing Madimi/Ojuju fallback values (not written down anywhere else, so recorded here):

```python
from fontTools.ttLib import TTFont
f = TTFont('SomeFont.ttf')
upm = f['head'].unitsPerEm
os2 = f['OS/2']
arial_xavg_per_em = 904 / 2048  # standard Arial OS/2.xAvgCharWidth / unitsPerEm
size_adjust = (os2.xAvgCharWidth / upm) / arial_xavg_per_em * 100       # → size-adjust
ascent_override = os2.sTypoAscender / upm * 100                         # → ascent-override
descent_override = abs(os2.sTypoDescender) / upm * 100                  # → descent-override

# line-gap-override is 0% for every face used so far (all have sTypoLineGap == 0)

```
