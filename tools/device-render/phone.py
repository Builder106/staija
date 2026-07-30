"""Generic handset with a UI screenshot on the screen, swaying in place.

    DEVICE_TEX=... DEVICE_OUT=... DEVICE_PREFIX=staija_phone_ \
        blender -b -P phone.py

    STILL=1 DEVICE_TEX=... blender -b -P phone.py    → test_still.png

Dimensions are metres and roughly life-size: a 7.1 x 14.9 cm slab with a
6.7 x 14.6 cm screen, i.e. the 1125 x 2436 aspect the mobile page captures at
behind a 1.7 mm bezel. Feed it a portrait screenshot; a landscape one will
letterbox.

The sway is gentler than the laptop's — a flat slab turned 35° hides most of
its own screen, so this runs at ±18° and stays readable throughout. Shared
render settings, materials and lighting live in device.py.

See this directory's README for the exact per-project invocation.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import device  # noqa: E402

SWAY_DEGREES = 18.0

cfg = device.settings(__file__)
scene = device.new_scene(1600, 1600)

body_mat = device.body_material()
screen_mat = device.screen_material(cfg.texture)

# --- Geometry ----------------------------------------------------------------
# The handset floats rather than resting on a surface, so the shot reads the
# same whether or not the composite behind it has a ground plane.
CENTRE_Z = 0.09
DEPTH = 0.00385  # half of a 7.7 mm slab

body = device.cube(
    "Body", 0.03545, DEPTH, 0.0747, (0, 0, CENTRE_Z), body_mat
)
# Generous bevel and extra segments: the rounded corner is most of what makes
# a featureless slab read as a phone.
device.bevel(body, 0.008, segments=12)

# Screen: 6.7 x 14.6 cm emission plane 0.4 mm proud of the front face, leaving
# the same thin bezel the hand-built model had.
screen = device.screen_plane(
    "ScreenPlane", 0.0337, 0.0730, (0, -(DEPTH + 0.0004), CENTRE_Z), screen_mat
)

root = device.empty("Root", (0, 0, CENTRE_Z))
device.parent_to(root, (body, screen))

# --- Framing -----------------------------------------------------------------
# 33 cm back on a 60 mm lens puts the 14.4 cm body across ~72% of the square
# frame, which is where the hand-rendered sequence had it.
target = device.empty("CamTarget", (0, 0, CENTRE_Z))
device.camera(scene, target, (0.0, -0.33, CENTRE_Z + 0.01), lens=60)

# Lights scale in toward the smaller subject, so their energies come down by
# roughly the square of that distance to hold the same exposure.
device.three_point(target, key=6.0, fill=2.2, rim=8.0, scale=0.42)
device.soft_world(scene)

device.sway(scene, root, degrees=SWAY_DEGREES)
device.render(scene, cfg)
