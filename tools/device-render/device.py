"""Shared scaffolding for headless-Blender product shots of a device.

Everything here is the part that must look identical across repos: render
settings, the slate body material, the emission screen, three-point lighting,
the tracked camera, and the seamless sway loop. A device script (laptop.py,
phone.py) supplies only geometry and a few framing numbers.

Environment contract, read by `settings()`:

    DEVICE_TEX      screen texture PNG (required)
    DEVICE_OUT      output directory for the frame sequence
                    (default: <repo>/tools/device-render/../../public)
    DEVICE_PREFIX   frame filename prefix, e.g. mm_laptop_ (required unless
                    STILL=1) — the device scripts carry no repo-specific names
    STILL=1         render one still to test_still.png instead of 60 frames

Conventions that are deliberate, not incidental: emission screen at strength
1.0 so the UI reads at its authored brightness, Standard view transform rather
than AgX so screenshot colours survive, transparent film for alpha compositing,
and 2x the display size so the device holds up under a push-in.
"""

import glob
import math
import os
import sys

import bpy

SWAY_FRAMES = 60
SWAY_DEGREES = 35.0
STILL_FRAME = 8  # a few degrees into the sway, so the shot reads with depth


class Settings:
    """Resolved environment contract for one render."""

    def __init__(self, script_dir):
        self.script_dir = script_dir
        self.still = os.environ.get("STILL") == "1"
        self.prefix = os.environ.get("DEVICE_PREFIX", "")
        if not self.still and not self.prefix:
            sys.exit("DEVICE_PREFIX is required, e.g. DEVICE_PREFIX=mm_laptop_")

        tex = os.environ.get("DEVICE_TEX")
        if not tex:
            sys.exit("DEVICE_TEX is required: path to the screen texture PNG")
        self.texture = os.path.abspath(os.path.expanduser(tex))
        if not os.path.exists(self.texture):
            sys.exit("DEVICE_TEX does not exist: " + self.texture)

        out = os.environ.get(
            "DEVICE_OUT", os.path.join(script_dir, "..", "..", "public")
        )
        self.out_dir = os.path.normpath(os.path.abspath(os.path.expanduser(out)))
        if not self.still and not os.path.isdir(self.out_dir):
            sys.exit("DEVICE_OUT is not a directory: " + self.out_dir)


def settings(script_path):
    return Settings(os.path.dirname(os.path.abspath(script_path)))


# --- Scene -------------------------------------------------------------------
def new_scene(width, height):
    """Empty scene at the shared render settings, sized to the device shot."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    _try_gpu(scene)
    return scene


def _try_gpu(scene):
    """Best-effort GPU. The ampere-dev VM has none, so CPU is a normal outcome."""
    for backend in ("METAL", "OPTIX", "CUDA", "HIP"):
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = backend
            prefs.get_devices()
            devices = [d for d in prefs.devices if d.type == backend]
            if not devices:
                continue
            for d in prefs.devices:
                d.use = True
            scene.cycles.device = "GPU"
            print("Cycles device:", backend)
            return
        except Exception as e:
            print("GPU backend", backend, "unavailable:", e)
    print("Cycles device: CPU")


# --- Materials ---------------------------------------------------------------
def slate(name, value, metallic, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*value, 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    return m


def body_material():
    return slate("Body", (0.030, 0.036, 0.050), 0.85, 0.52)


def screen_material(texture_path):
    """Unlit emission of the UI screenshot — no shading on top of the pixels."""
    mat = bpy.data.materials.new("Screen")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = bpy.data.images.load(texture_path)
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(tex_node.outputs["Color"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


# --- Geometry helpers --------------------------------------------------------
def cube(name, sx, sy, sz, loc, mat):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    o.data.materials.append(mat)
    return o


def bevel(obj, width, segments=4):
    m = obj.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    return m


def screen_plane(name, half_width, half_height, loc, mat):
    """Upright plane facing -Y, i.e. toward the camera."""
    bpy.ops.mesh.primitive_plane_add(size=2, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = (math.radians(90), 0, 0)
    o.scale = (half_width, half_height, 1)
    o.data.materials.append(mat)
    return o


def empty(name, loc):
    bpy.ops.object.empty_add(location=loc)
    o = bpy.context.active_object
    o.name = name
    return o


def parent_to(parent, children):
    bpy.ops.object.select_all(action="DESELECT")
    for o in children:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parent
    bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)
    return parent


# --- Camera, lights, world ---------------------------------------------------
def track_to(obj, target):
    c = obj.constraints.new("TRACK_TO")
    c.target = target
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"
    return c


def camera(scene, target, location, lens):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.data.lens = lens
    track_to(cam, target)
    scene.camera = cam
    return cam


def three_point(target, key=32, fill=12, rim=45, scale=1.0):
    """Key low-left, fill right, rim behind. `scale` fits it to the device size."""

    def area(name, loc, energy, size):
        bpy.ops.object.light_add(
            type="AREA", location=tuple(c * scale for c in loc)
        )
        L = bpy.context.active_object
        L.name = name
        L.data.energy = energy
        L.data.size = size * scale
        track_to(L, target)
        return L

    return (
        area("Key", (-0.55, -0.55, 0.55), key, 1.2),
        area("Fill", (0.60, -0.45, 0.30), fill, 0.7),
        area("Rim", (0.05, 0.60, 0.55), rim, 0.6),
    )


def soft_world(scene):
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.20, 0.21, 0.24, 1.0)
    bg.inputs["Strength"].default_value = 0.5
    return world


# --- Animation ---------------------------------------------------------------
def sway(scene, root, degrees=SWAY_DEGREES, frames=SWAY_FRAMES):
    """Seamless sine loop about Z. Frame `frames + 1` equals frame 1."""
    scene.frame_start = 1
    scene.frame_end = frames
    for f in range(1, frames + 2):
        t = (f - 1) / float(frames)
        root.rotation_euler.z = math.radians(degrees) * math.sin(2 * math.pi * t)
        root.keyframe_insert(data_path="rotation_euler", index=2, frame=f)


# --- Render ------------------------------------------------------------------
def render(scene, cfg):
    if cfg.still:
        scene.frame_set(STILL_FRAME)
        scene.render.filepath = os.path.join(cfg.script_dir, "test_still.png")
        bpy.ops.render.render(write_still=True)
        print("STILL DONE:", scene.render.filepath)
        return

    # Wipe stale frames from a previous run before rendering fresh ones, so a
    # shorter re-render never leaves old high-numbered frames behind.
    for stale in glob.glob(os.path.join(cfg.out_dir, cfg.prefix + "*.png")):
        os.remove(stale)
    scene.render.filepath = os.path.join(cfg.out_dir, cfg.prefix)
    bpy.ops.render.render(animation=True)
    print("SEQUENCE DONE:", scene.render.filepath)
