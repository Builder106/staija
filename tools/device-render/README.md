# Device renders

Headless Blender product shots of a handset or a laptop with a STAIJA
screenshot glowing on the screen. Remotion plays the resulting 60-frame
sequence back as a slow sway. Only the phone is wired into a composition
today — `laptop.py` is here so the two repos stay in step.

`device.py` holds everything that has to match across projects — render
settings, materials, lighting, camera, the sway loop. `laptop.py` and
`phone.py` add geometry and framing. All three files are kept byte-identical
with the copy in the MicroMatch repo; only this README differs.

## Rendering

Nothing here runs on the Mac. Renders happen on `ampere-dev`, which is
CPU-only, so budget hours for a full sequence and check a still first.

```console
STILL=1 DEVICE_TEX=$PWD/../../trailer/public/staija_mobile.png blender -b -P phone.py
```

That writes `test_still.png` next to the script. Once the framing looks right:

```console
DEVICE_TEX=$PWD/../../trailer/public/staija_mobile.png \
DEVICE_OUT=$PWD/../../trailer/public \
DEVICE_PREFIX=staija_phone_ \
  blender -b -P phone.py
```

## Environment

| Variable | Meaning |
| --- | --- |
| `DEVICE_TEX` | Screen texture PNG. Required. |
| `DEVICE_OUT` | Directory for the frame sequence. Defaults to`../../public`. |
| `DEVICE_PREFIX` | Frame filename prefix. Required unless`STILL=1`. |
| `STILL=1` | One frame to`test_still.png` instead of the sequence. |

## The screen texture

`trailer/public/staija_mobile.png` is a 1125 x 2436 capture of staija.org at
an iPhone X viewport, from `trailer/scratch/capture_mobile.js`. Re-run that
when the site changes, then re-render. The texture is committed; the frames
are not.

## Frames are not committed

`staija_phone_*.png` is gitignored: 78 MB of deterministic output. A clean
checkout needs a render before `trailer/` will build.

This replaced a hand-built `phone.blend` that used to live in
`trailer/public/`. It was untracked rather than deleted, and backed up to
`~/Documents/staija-phone-BACKUP.blend`.
