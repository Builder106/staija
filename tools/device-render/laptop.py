"""Generic open laptop with a UI screenshot on the screen, swaying in place.

    DEVICE_TEX=... DEVICE_OUT=... DEVICE_PREFIX=mm_laptop_ \
        blender -b -P laptop.py

    STILL=1 DEVICE_TEX=... blender -b -P laptop.py   → test_still.png

See this directory's README for the exact per-project invocation.

Dimensions are metres and roughly life-size: a 34 x 23 cm deck under a 34 x
22.4 cm lid, with a 16:10 screen. Shared render settings, materials, lighting
and the sway loop all live in device.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import device  # noqa: E402

cfg = device.settings(__file__)
scene = device.new_scene(2400, 1600)

body_mat = device.body_material()
well_mat = device.slate("KeyWell", (0.010, 0.012, 0.016), 0.10, 0.70)
pad_mat = device.slate("Trackpad", (0.05, 0.058, 0.075), 0.40, 0.50)
screen_mat = device.screen_material(cfg.texture)

# --- Geometry ----------------------------------------------------------------
# Base deck: 34 x 23 x 1.5 cm, front toward -Y
base = device.cube("Base", 0.17, 0.115, 0.0075, (0, 0, 0.0075), body_mat)
device.bevel(base, 0.004)

# Keyboard well + trackpad, thin insets on the deck top
well = device.cube("KeyWell", 0.150, 0.062, 0.0006, (0, 0.030, 0.0155), well_mat)
pad = device.cube("Trackpad", 0.055, 0.036, 0.0006, (0, -0.068, 0.0155), pad_mat)

# Lid: 34 cm wide, 22.4 cm tall, 7 mm thick, standing up from the rear hinge
lid = device.cube("Lid", 0.17, 0.0035, 0.112, (0, 0.1115, 0.127), body_mat)
device.bevel(lid, 0.003)

# Screen: 32 x 20 cm (16:10) emission plane on the lid's front face
screen = device.screen_plane(
    "ScreenPlane", 0.16, 0.10, (0, 0.1076, 0.127), screen_mat
)

# Hinge assembly: lid + screen pivot together, tilted 15° back
hinge = device.empty("Hinge", (0, 0.1115, 0.015))
device.parent_to(hinge, (lid, screen))
hinge.rotation_euler.x = math.radians(-15)

root = device.empty("Root", (0, 0, 0))
device.parent_to(root, (base, well, pad, hinge))

# --- Framing -----------------------------------------------------------------
target = device.empty("CamTarget", (0, 0.01, 0.10))
device.camera(scene, target, (0.0, -1.10, 0.42), lens=60)
device.three_point(target)
device.soft_world(scene)

device.sway(scene, root)
device.render(scene, cfg)
