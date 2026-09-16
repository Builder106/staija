# Avatar generation pipeline

**Current architecture:** the frontend still exposes whole-portrait
avatars, while the ten curated slots also have a versioned layered source
pipeline for static tracing and rich animation. A generalized user-created
layered-PFP editor remains paused. See [the parts.ts comment](../../src/services/avatar/parts.ts)
for the runtime boundary.

**Scripted pipeline.**

```text
layer sources → composite.ts (PNG) → trace.ts (VTracer SVG) → clean.ts (parts.ts) → thumbs
```

Tracing uses the pinned VTracer Node/WASM package. It runs locally,
requires no runtime secret or Vercel environment variable, and does not
add a provider watermark. The approved `poster-cutout-detail` output is
the current static production candidate. Future candidates must pass
structural and visual comparison before replacing production assets. The paused
semantic face-labeling path remains optional historical tooling and is
not part of this whole-portrait pipeline.

The 10 prompt names in [prompts.ts](./prompts.ts) preserve slot order for
the existing API and optional source-art generation. The authoritative
inputs for the promoted outputs are the layered manifests and assets under
`tools/avatars/layers/`. Re-run `npm run avatars:static-candidate` after
editing them; do not hand-edit `src/services/avatar/parts.ts`.

## Legacy whole-portrait provenance

[legacy-whole-portraits.v1.json](./provenance/legacy-whole-portraits.v1.json)
records the recoverable recipe for the ten original whole-portrait PNGs:
their prompts, deterministic Pollinations `flux` seeds, request settings,
initial PNG Git blob IDs, the manual Vectorizer.AI tracing step, and
DiceBear's former selection-only role. It is historical evidence, not an
input to the current layered-avatar pipeline.

The original provider responses and manually downloaded trace exports were
not committed. The manifest can reconstruct the request but cannot guarantee
identical pixels from a changed remote model or service.

## Providers (PNG generation)

| Provider | Free? | Auth | Quality | Notes |
| --- | --- | --- | --- | --- |
| **`pollinations`**(default) | yes, actually | none | good | Free FLUX-based generation. Sometimes 502s under load; the script retries.**Use this.** |
| `hf` | "free trial" | `HF_TOKEN` env var | excellent | HF's Inference Providers credits get used up in 3-5 images and routed to the paid fal-ai backend. Worth using only if you have HF PRO. |

## Credentials via `.env`

`generate.ts` auto-loads `.env` from the project root before reading
`process.env`. Add what you have:

```sh
HF_TOKEN=hf_xxxxx
```

`.env`is gitignored. Shell`export`-ing still works too.

## Run

**1. Generate** PNGs from the prompts. Pollinations (default, free):

```sh
npm run avatars:generate
```

HF (needs token + credits):

```sh
HF_TOKEN=hf_xxxxx npm run avatars:generate -- --provider hf
```

Output lands in `tools/avatars/raw/`.

**2. Composite and trace** the reviewed layered sources with VTracer:

```sh
npm run avatars:static-candidate -- --force --profile poster-cutout-detail
```

For raw prompt PNGs, trace every generated PNG with VTracer:

```sh
npm run avatars:trace -- --all --force --profile poster-cutout
```

Use `--slot <N>` for one prompt, `--input-dir <dir>` for a compositor
candidate, and `--output-dir <dir>` for an isolated comparison. Available
profiles include `poster-spline`, `poster-cutout`, `poster-polygon`, and
the balanced/detail variants. The command fails closed when a portrait is
missing, duplicated, or has an invalid output.

**3. Clean** the SVGs for inspection:

```sh
npm run avatars:clean -- --background preserve --no-write-parts
```

The default `--background preserve` mode keeps the colored full-canvas
background. Use `--background transparent` only for an explicit,
non-production transparency experiment. Pass `--input-dir` and
`--output-dir` for isolated candidates. Use `--parts-output` to write a
review-only generated library. Only after visual approval, target
`src/services/avatar/parts.ts`.

**4. Verify** the complete cleaned set:

```sh
npm run avatars:verify -- --input-dir tools/avatars/clean
```

Verification requires exactly ten expected portraits and rejects
malformed SVGs, missing viewBoxes, embedded images, and watermark
markers.

**5. Compare** a candidate against the production baseline:

```sh
npm run avatars:compare -- \
  --baseline-dir <baseline-dir> \
  --candidate-dir <candidate-clean-dir> \
  --background preserve \
  --sizes 32,56,72,80,120,160,256 \
  --report-dir <report-dir>
```

Baseline and candidate must use the same renderer, dimensions,
compositing background, and output format. The report records SVG
metrics and rasterized results, and produces side-by-side sheets.
Use temporary report and render directories; do not replace tracked
thumbnails during benchmarking.

## What `clean` does

1. Runs SVGO with `preset-default` + custom plugins to:

- Strip metadata, comments, redundant attributes
- Simplify path data (lower number precision, fewer Bézier nodes)
- Preserve the full-canvas background by default. Background removal is
  explicit through `--background transparent` and is not used for the
  production comparison.

1. Extracts inner SVG content from each `<svg>` wrapper
2. Wraps in `<g transform="scale(80/origSize)">` so the trace's native

   coordinates fit the avatar style's `0 0 80 80` viewBox

3. Writes a standalone copy to `tools/avatars/clean/{name}.svg`
4. Regenerates `src/services/avatar/parts.ts` with all 10 cleaned

   fragments inlined into the `PORTRAITS` array, with slot-name
   comments preserved from `prompts.ts`

## Fidelity tuning rounds

Tuning is limited to two rounds. Round 1 uses the exact
`poster-cutout-balanced` profile:

```text
preset=poster, clustering=color-cluster, hierarchical=cutout,
mode=spline, filterSpeckle=2, simplify=1, maxColors=24, optimize=1
```

Round 2 uses these exact profiles:

```text
poster-cutout-detail:
preset=poster, clustering=color-cluster, hierarchical=cutout,
mode=spline, filterSpeckle=1, simplify=0.5, maxColors=32, optimize=1

poster-polygon-detail:
preset=poster, clustering=color-cluster, hierarchical=cutout,
mode=polygon, filterSpeckle=1, maxColors=32, optimize=1
```

The polygon profile has no `simplify` setting because that option does
not apply to polygon geometry. Do not add pixel mode, stacked hierarchy,
or optimizer variants to these rounds.

Review every portrait at each comparison size for silhouette, facial
features, hair and accessories, palette separation, background behavior,
seams, halos, cropping, and sharpness. Stop at the first profile that
matches the baseline. If both rounds retain the same failures, stop with
`plateau`, keep the current production assets unchanged, and record the
result for a separate tracer evaluation.

## Runtime SVGs and PNG thumbnails

`src/services/avatar/parts.ts` contains cleaned inline SVG fragments
used by the SVG avatar service. `public/avatars/*.png` contains static
raster thumbnails used by the picker and thumbnail surfaces. Updating
`parts.ts` does not regenerate the public PNGs automatically. Regenerate
thumbnails explicitly only after a candidate passes visual approval;
benchmark renders must use temporary assets instead.

## Slot mapping

`clean.ts` writes the cleaned SVG fragments into `parts.ts` at indices
matching the stable slot order in [prompts.ts](./prompts.ts):

| Trace file | `PORTRAITS` index |
| --- | --- |
| `portrait-bald.svg` | 0 |
| `portrait-afro-medium.svg` | 1 |
| `portrait-locs.svg` | 2 |
| `portrait-braids-long.svg` | 3 |
| `portrait-hijab.svg` | 4 |
| `portrait-gele.svg` | 5 |
| `portrait-twa-glasses.svg` | 6 |
| `portrait-twists-puff.svg` | 7 |
| `portrait-fade-glasses.svg` | 8 |
| `portrait-bantu.svg` | 9 |

If you ever want to hand-edit a portrait further, do it in
`tools/avatars/clean/{name}.svg`and re-run`npm run avatars:clean`.
Direct edits to `src/services/avatar/parts.ts` get clobbered on the
next clean run.

## Phase 4 — Rich Lottie animations

The local, reproducible rigger generates all ten animations from reviewed
transparent layer assets. It does not use Lottie Creator, MCP, or remote
asset URLs.

Each slot requires a manifest under `tools/avatars/manifests.ts` and these
animation-safe layers under `tools/avatars/layers/slot-N/`:

```text
background.png  body.png        head.png       hair-back.png
hair-front.png  eyes-open.png   eyes-closed.png  brows.png
mouth-rest.png  mouth-smile.png
```

Optional accessories use unique IDs such as `accessory-glasses.png`.
Every layer must be a reviewed 256×256 RGBA asset with identical alignment,
explicit z-order, and no pixels belonging to another layer. Existing
flattened portraits cannot be split safely into these layers.

Generate the JSON assets with:

```sh
npm run avatars:lottie -- --all --force
```

The command fails closed when a required source layer is missing. Validate
generated files with the tool tests before committing them. The runtime
discovers `src/assets/avatar-lotties/slot-<N>.json` lazily and keeps the
static PNG fallback for load errors and reduced-motion users.

### Visual verification

Drop a `slot-N.json`in and visit`/admin/avatar-preview` — a new
"Lottie variants" section will appear comparing the static thumbnail
to the animated version. Sign-off check before shipping to Settings.

## Settings integration

The Settings page already renders the generated avatar via
`AnimatedAvatar` (Phase 1) with the universal default of slot 6. The
gallery picker (`AvatarPicker`) lets users override. The Lottie
overlay (Phase 4 above) layers automatically on top when a matching
JSON file exists. It remains static until reviewed layer assets and
validated slot JSON files are available.

## .gitignore note

Add `tools/avatars/raw/`, `tools/avatars/traced/`, and other generated
intermediate directories to `.gitignore`. Keep reviewed layer sources,
manifests, generator code, cleaned SVG output in `parts.ts`, and validated
Lottie JSON assets in the repository. Do not commit raw comparison reports
or unreviewed generated intermediates.
