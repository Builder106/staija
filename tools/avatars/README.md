# Avatar generation pipeline

**Current architecture (2026-05-06 pivot):** whole-portrait avatars,
not layered parts. Each prompt produces a complete head/shoulders
illustration; the avatar style seed-picks one per scholar. Diffusion
image models can't reliably produce isolated body parts on transparent
backgrounds, so the layered/animated approach is **paused** in favor
of whole portraits — not dropped. The layered pipeline (including
[tag_potrait.py](../tag_potrait.py)) stays in the tree for when we
revisit it. See [the parts.ts comment](../../src/services/avatar/parts.ts)
for the full reasoning behind the current path.

**Scripted pipeline.**

```text
generate.ts (PNG)  →  trace.ts (SVG)  →  clean.ts (cleaned + parts.ts auto-written)  →  thumbs
```

Tracing uses the pinned VTracer Node/WASM package. It runs locally,
requires no runtime secret or Vercel environment variable, and does not
add a provider watermark. Candidate output must pass structural and
visual comparison before replacing production assets. The paused
semantic face-labeling path remains optional historical tooling and is
not part of this whole-portrait pipeline.

The 10 prompts live in [prompts.ts](./prompts.ts) — edit there, not in
the scripts. Re-running with new prompts will overwrite
`src/services/avatar/parts.ts`on the next`clean` step.

## Providers (PNG generation)

| Provider | Free? | Auth | Quality | Notes |
| --- | --- | --- | --- | --- |
| **`pollinations`**(default) | yes, actually | none | good | Free FLUX-based generation. Sometimes 502s under load; the script retries.**Use this.** |
| `hf` | "free trial" | `HF_TOKEN` env var | excellent | HF's Inference Providers credits get used up in 3-5 images and routed to the paid fal-ai backend. Worth using only if you have HF PRO. |

## Credentials via `.env`

`generate.ts`auto-loads`.env` from the project root before reading
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

**2. Trace** every generated PNG with VTracer:

```sh
npm run avatars:trace -- --all --force --profile poster-cutout
```

Use `--slot <N>` for one prompt and `--output-dir <dir>` for an
isolated comparison. Available profiles are `poster-spline`,
`poster-cutout`, and `poster-polygon`. The command fails closed when a
portrait is missing, duplicated, or has an invalid output.

**3. Clean** the SVGs for inspection:

```sh
npm run avatars:clean -- --background preserve --no-write-parts
```

The default `--background preserve` mode keeps the colored full-canvas
background. Use `--background transparent` only for an explicit,
non-production transparency experiment. Pass `--input-dir` and
`--output-dir` for isolated candidates. Only after visual approval,
rerun without `--no-write-parts` to update `src/services/avatar/parts.ts`.

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
`plateau`, keep `parts.ts` and `public/avatars` unchanged, and record the
result for a separate tracer evaluation.

## Runtime SVGs and PNG thumbnails

`src/services/avatar/parts.ts` contains cleaned inline SVG fragments
used by the SVG avatar service. `public/avatars/*.png` contains static
raster thumbnails used by the picker and thumbnail surfaces. Updating
`parts.ts` does not regenerate the public PNGs automatically. Regenerate
thumbnails explicitly only after a candidate passes visual approval;
benchmark renders must use temporary assets instead.

## Slot mapping

`clean.ts`writes the cleaned SVG fragments into`parts.ts` at indices
matching the prompt order in [prompts.ts](./prompts.ts):

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

## Phase 4 — Lottie animations

Each portrait slot can have an OPTIONAL rigged Lottie animation that
overlays the static thumbnail on the Settings hero (and any future
surface that opts in via `LottieAvatar.vue`). Phase 4 is opt-in: the
codebase ships zero Lottie files by default, so all surfaces fall
back to the static PNG.

**File location:** [src/assets/avatar-lotties/slot-&lt;N&gt;.json](../../src/assets/avatar-lotties/)
where `N` matches the slot index in the table above. The runtime
discovers files by glob — drop one in and it lights up automatically.

### Path A — Lottie Creator GUI (no MCP)

1. Open <https://creator.lottiefiles.com/>
2. Import [public/avatars/portrait-N.png](../../public/avatars/) at

   256×256 as a raster layer

3. Build motion: idle breath, eye blinks, head tilt, expression

   shifts. The avatar displays at 80px in Settings — keep motion
   subtle enough to read at that size

4. Export as Bodymovin/Lottie JSON
5. Save as `slot-N.json`in`src/assets/avatar-lotties/`
6. Reload Settings — the wired slot will swap from static PNG to

   animated Lottie automatically

### Path B — Lottie Creator MCP (Claude Code agent)

The `lottiefiles-creator` MCP server is registered in this project
(`claude mcp list` to verify). When connected to a Creator browser
tab with MCP enabled in Creator's settings:

1. Open Creator in a browser. Settings → enable MCP
2. Tell Claude Code: *"Rig slot 6 with eye blinks every 4s and a

   subtle head tilt right on hover. Source: public/avatars/portrait-6.png"*

3. The agent calls `mcp__lottiefiles-creator__run_script` to script

   the layer/keyframe/easing creation in your Creator tab

4. Export from Creator and save as `slot-6.json`

The MCP can't persist across sessions — every conversation starts
with a fresh Creator state. Treat it as guided rigging, not
unattended.

### Visual verification

Drop a `slot-N.json`in and visit`/admin/avatar-preview` — a new
"Lottie variants" section will appear comparing the static thumbnail
to the animated version. Sign-off check before shipping to Settings.

## Re-enabling the Settings integration (historical)

The Settings page already renders the generated avatar via
`AnimatedAvatar` (Phase 1) with the universal default of slot 6. The
gallery picker (`AvatarPicker`) lets users override. The Lottie
overlay (Phase 4 above) layers automatically on top when a matching
JSON file exists.

## .gitignore note

Add `tools/avatars/raw/`and`tools/avatars/traced/`to`.gitignore` —
those are intermediate artifacts, not source. Only `prompts.ts`,
`generate.ts`, `clean.ts`, this README, and the cleaned SVGs that land
in `src/services/avatar/parts.ts` belong in the repo.
