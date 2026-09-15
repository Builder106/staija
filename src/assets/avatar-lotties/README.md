# Avatar Lottie animations

Validated rich Lottie animations, one per portrait slot. When a file exists
at `slot-<N>.json`, the Settings hero and other opted-in surfaces play the
animation instead of the static PNG thumbnail.

The repository rigger produces these files from reviewed transparent layer
assets. The runtime uses the matching animation when present and retains
static PNG fallbacks for load errors and reduced-motion users.

## Filename convention

Each file must be named exactly `slot-<N>.json`, where `N` matches the
slot index in [tools/avatars/prompts.ts](../../../tools/avatars/prompts.ts).
The runtime lookup in [lotties.ts](../../services/avatar/lotties.ts) discovers
files by glob.

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

Each slot requires reviewed 256×256 RGBA layers under
`tools/avatars/layers/slot-<N>/`: background, body, head, hair-back,
hair-front, eyes-open, eyes-closed, brows, mouth-rest, and mouth-smile.
Optional accessories use unique IDs such as `accessory-glasses.png`.

Existing flattened portraits cannot be split safely into these layers. Each
layer must have fixed alignment, explicit z-order, and no pixels belonging to
another layer.

After the source layers exist, run:

```sh
npm run avatars:lottie -- --all --force
```

The local rigger creates embedded, self-contained JSON and validates every
document before writing it. It fails closed when a required layer is missing,
a reference is invalid, or a remote asset is present.

## Bundle behavior

`import.meta.glob` lazy-loads each JSON. Settings loads only the selected
slot after the initial paint; the admin preview intentionally loads all ten.

## Inspection

Visit `/admin/avatar-preview` to review all ten Lottie variants alongside
their static versions before release.
