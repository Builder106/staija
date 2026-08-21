# Device renders

Headless Blender product shots of a handset or a laptop with a STAIJA
screenshot on the screen. The current HyperFrames trailer uses a CSS phone
frame and `trailer/public/staija_mobile.png`, so this tool is not part of the
active STAIJA video pipeline. Keep it for future standalone device assets.

`device.py` holds the shared render settings, materials, lighting, camera, and
sway loop. `laptop.py` and `phone.py` add geometry and framing. All three
files are kept byte-identical with the copy in the MicroMatch repo; only this
README differs.

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

`staija_phone_*.png` is gitignored: 78 MB of deterministic output. The current
HyperFrames trailer does not need the sequence.

This replaced a hand-built `phone.blend` that used to live in
`trailer/public/`. It was untracked rather than deleted, and backed up to
`~/Documents/staija-phone-BACKUP.blend`.
