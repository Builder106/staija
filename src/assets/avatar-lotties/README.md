# Avatar Lottie animations

Optional rigged Lottie animations, one per portrait slot. When a file
exists at `slot-<N>.json` for a given slot, the Settings hero
(and any other surface that opts in via `LottieAvatar`) plays the
Lottie instead of rendering the static PNG thumbnail.

**This directory is intentionally empty by default** — Phase 4 of the
avatar animation work is opt-in. Most surfaces use `AnimatedAvatar`
with the static PNG (cheap, fast, expressive enough). Lottie is
reserved for surfaces where character-level motion (eye blink, head
tilt, expression shift) earns the rigging cost.

## Filename convention

Each file must be named exactly `slot-<N>.json` where `N` matches
the slot index in [tools/avatars/prompts.ts](../../../tools/avatars/prompts.ts).
The runtime lookup in [`../../services/avatar/lotties.ts`](../../services/avatar/lotties.ts)
discovers files by glob, so adding a new file is zero-config — just
drop it in.

| Slot | Portrait |
| --- | --- |
| 0 | bald |
| 1 | afro-medium |
| 2 | locs |
| 3 | braids-long |
| 4 | hijab |
| 5 | gele |
| 6 | twa-glasses (universal default) |
| 7 | twists-puff |
| 8 | fade-glasses |
| 9 | bantu |

## Producing a Lottie file

There are two paths.

### Path A — manually in Lottie Creator (Web)

1. Open <https://creator.lottiefiles.com/>.
2. Import the matching PNG from
   [public/avatars/portrait-N.png](../../../public/avatars/) as a
   raster layer at 256×256.
3. Add motion: scale-in entrance, idle breath, eye blinks (manually
   drawn vector layers over the eye region), head tilt, etc.
4. Export as Bodymovin/Lottie JSON.
5. Save as `slot-<N>.json` in this directory.
6. Settings hero will pick it up automatically on next page load.

### Path B — via the Lottie Creator MCP

Once Creator is open in a browser tab and the MCP is enabled in
Creator's settings, an LLM agent (Claude Code with the
`lottiefiles-creator` MCP installed) can drive the rigging via
`run_script`. Hand the agent: the slot number, the source PNG path,
and the desired motion (e.g. "blink every 4 seconds, slight head
tilt right on hover"). The agent emits Creator script that builds
the layers, then exports.

Note: the MCP `run_script` only works when Creator is the active
foreground tab. The agent cannot persist state — every session
starts fresh.

## Bundle behavior

`import.meta.glob` lazy-loads each JSON, so adding 10 Lottie files
doesn't bloat pages that don't use Lottie. The Settings hero
imports its slot's animation on mount (after the initial paint
completes), so the cold-load cost lands after the page is interactive.

## Inspection

To preview an existing file without checking it into the avatar
flow, drop it in this directory and visit `/admin/avatar-preview` —
the Lottie variant of each slot will render alongside the static
version when a file exists.
