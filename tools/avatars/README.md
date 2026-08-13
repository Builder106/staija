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

**Two scripted steps + one manual step.**

```text
generate.ts (PNG)  →  vectorizer.ai web (SVG)  →  clean.ts (cleaned + parts.ts auto-written)
```

The middle step is done by hand on <https://vectorizer.ai>. We tried
the Node-based tracers (VTracer via `@neplex/vectorizer`,
imagetracerjs) and Vectorizer.AI's API; the web UI produces noticeably
cleaner palettes (12–18 colors per portrait vs 100+ from the FOSS
tracers) and is fast enough for 10 images that automating it isn't
worth the cost. Drop the resulting SVGs into `tools/avatars/traced/`
under their original `portrait-<slot>.svg`names and run`clean`.

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

**2. Vectorize** by hand on <https://vectorizer.ai>. Upload each PNG,
download the SVG, and save it to `tools/avatars/traced/` under the
exact same stem (e.g. `portrait-hijab.png`→`portrait-hijab.svg`).

If Vectorizer.AI's output omits `viewBox` (it sometimes does), the
SVGs render cropped in viewers. The fix is a one-liner — see
[the viewBox patch](#fixing-missing-viewbox) below.

**3. Clean** the SVGs and inline into `parts.ts`:

```sh
npm run avatars:clean
```

`avatars:clean`writes both`tools/avatars/clean/*.svg` (for inspection)
and `src/services/avatar/parts.ts` (the production artifact). Pass
`--no-write-parts` to only emit the inspection copies and leave parts.ts
alone.

## What `clean` does

1. Runs SVGO with `preset-default` + custom plugins to:

- Strip metadata, comments, redundant attributes
- Simplify path data (lower number precision, fewer Bézier nodes)
- Detect and delete the background rectangle (the first big path

     is usually the canvas backdrop). Skipped if the path is small or
     its fill is a brand color (so we don't false-positive a hijab
     or gele silhouette as background).

- Drop any path with `vector-effect="non-scaling-stroke"` — those

     are stroke-based watermarks left over from the API tier.

1. Extracts inner SVG content from each `<svg>` wrapper
2. Wraps in `<g transform="scale(80/origSize)">` so the trace's native

   coordinates fit the avatar style's `0 0 80 80` viewBox

3. Writes a standalone copy to `tools/avatars/clean/{name}.svg`
4. Regenerates `src/services/avatar/parts.ts` with all 10 cleaned

   fragments inlined into the `PORTRAITS` array, with slot-name
   comments preserved from `prompts.ts`

## Fixing missing viewBox

If the web Vectorizer.AI output looks cropped in Inkscape/VS Code, the
SVG is missing its `viewBox`. The PNGs are 768×768, so:

```sh
for f in tools/avatars/traced/*.svg; do
  grep -q 'viewBox=' "$f" || sed -i '' \
    's|<svg xmlns="http://www.w3.org/2000/svg">|<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 768">|' "$f"
done
```

Idempotent — files that already have `viewBox` are skipped.

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
