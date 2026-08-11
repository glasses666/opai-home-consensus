"""Build the original Gate 2 furniture GLBs with Blender.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build_demo_assets.py
"""

from math import radians
from pathlib import Path
import sys

import bpy
from mathutils import Vector


OUTPUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "models"


def material(name, color, roughness=0.62, metallic=0.0):
    value = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = next(node for node in value.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return value


IVORY = material("Warm ivory", (0.79, 0.75, 0.68), 0.78)
OAT = material("Oat textile", (0.56, 0.51, 0.44), 0.9)
OAK = material("Light oak", (0.58, 0.38, 0.19), 0.58)
BURGUNDY = material("Burgundy textile", (0.28, 0.045, 0.07), 0.88)
CHARCOAL = material("Graphite", (0.055, 0.052, 0.047), 0.5)
BRASS = material("Brushed brass", (0.42, 0.26, 0.11), 0.3, 0.62)
WHITE = material("Warm white", (0.9, 0.87, 0.81), 0.74)
GREEN = material("Muted leaf", (0.12, 0.24, 0.12), 0.82)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def box(name, size, location, mat, bevel=0.025, rotation=(0, 0, 0), role="canonical", smooth=False):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(value / 2 for value in size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = min(bevel, min(size) * 0.22)
        modifier.segments = 4
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.data.materials.append(mat)
    obj["material_role"] = role
    return obj


def cylinder(name, radius, depth, location, mat, role="accent", rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj["material_role"] = role
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def sphere(name, scale, location, mat, role="accent"):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj["material_role"] = role
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_plant(x, y, z, scale=1.0):
    cylinder("ACCENT planter", 0.1 * scale, 0.19 * scale, (x, y, z + 0.095 * scale), CHARCOAL)
    for offset_x, offset_y, tilt in [(-0.045, 0.0, -18), (0.04, 0.02, 20), (0, -0.03, 2)]:
        leaf = sphere("ACCENT leaf", (0.045, 0.02, 0.13), (x + offset_x * scale, y + offset_y * scale, z + 0.27 * scale), GREEN)
        leaf.rotation_euler[1] = radians(tilt)


def sofa():
    box("CANONICAL frame", (2.08, 0.78, 0.17), (0, 0, 0.24), OAT, 0.07, smooth=True)
    for x in (-0.99, 0.99):
        box("CANONICAL arm", (0.18, 0.82, 0.5), (x, -0.005, 0.48), OAT, 0.075, smooth=True)
    for index, x in enumerate((-0.66, 0, 0.66)):
        box(f"CANONICAL seat {index + 1}", (0.62, 0.67, 0.15), (x, -0.03, 0.42), IVORY, 0.07, smooth=True)
        box(f"CANONICAL back {index + 1}", (0.61, 0.17, 0.43), (x, 0.29, 0.68), IVORY, 0.08, rotation=(radians(-8), 0, 0), smooth=True)
    for x in (-0.78, 0.78):
        cylinder("ACCENT oak foot", 0.035, 0.14, (x, -0.25, 0.07), OAK)
        cylinder("ACCENT oak foot", 0.035, 0.14, (x, 0.25, 0.07), OAK)
    box("ACCENT throw", (0.48, 0.58, 0.045), (0.48, -0.05, 0.52), BURGUNDY, 0.025, rotation=(0, 0, radians(5)), smooth=True)


def dining_table():
    box("CANONICAL table top", (1.6, 0.9, 0.09), (0, 0, 0.71), OAK, 0.07)
    for x in (-0.62, 0.62):
        for y in (-0.28, 0.28):
            cylinder("CANONICAL table leg", 0.035, 0.69, (x, y, 0.345), OAK, role="canonical")
    add_plant(0, 0, 0.76, 0.68)


def tv_console():
    box("ACCENT oak media panel", (1.82, 0.05, 1.36), (0, 0.19, 1.08), OAK, 0.025, role="accent")
    box("ACCENT television", (1.46, 0.045, 0.82), (0, 0.15, 1.18), CHARCOAL, 0.035, role="accent")
    box("ACCENT television inset", (1.32, 0.018, 0.68), (0, 0.12, 1.18), material("Screen", (0.018, 0.021, 0.022), 0.16), 0.02, role="accent")
    box("CANONICAL case", (2.2, 0.45, 0.42), (0, 0, 0.29), OAK, 0.045)
    for index, x in enumerate((-0.79, -0.27, 0.27, 0.79)):
        box(f"CANONICAL front {index + 1}", (0.48, 0.025, 0.31), (x, -0.228, 0.31), OAK, 0.015)
        cylinder("ACCENT pull", 0.014, 0.09, (x, -0.255, 0.33), BRASS, rotation=(radians(90), 0, 0))
    for x in (-0.86, 0.86):
        cylinder("ACCENT foot", 0.025, 0.14, (x, 0, 0.07), CHARCOAL)
    add_plant(0.72, 0, 0.5, 0.72)


def bed(width, depth, height, single=False):
    box("CANONICAL bed frame", (width, depth, 0.18), (0, 0, 0.2), OAK, 0.045)
    box("ACCENT mattress", (width * 0.94, depth * 0.9, 0.24), (0, -0.02, 0.41), IVORY, 0.08, role="accent", smooth=True)
    box("CANONICAL headboard", (width, 0.14, min(height, 1.05)), (0, depth * 0.45, min(height, 1.05) / 2), OAT, 0.065, smooth=True)
    pillow_count = 1 if single else 2
    for index in range(pillow_count):
        x = 0 if single else (-width * 0.24 if index == 0 else width * 0.24)
        box("ACCENT pillow", (width * (0.56 if single else 0.42), 0.34, 0.12), (x, depth * 0.25, 0.63), IVORY, 0.075, smooth=True)
    box("ACCENT runner", (width * 0.9, 0.42, 0.04), (0, -depth * 0.27, 0.56), BURGUNDY, 0.025, smooth=True)


def wardrobe():
    box("CANONICAL carcass", (2.4, 0.6, 2.4), (0, 0, 1.2), WHITE, 0.035)
    for index, x in enumerate((-0.88, -0.29, 0.29, 0.88)):
        box(f"CANONICAL door {index + 1}", (0.55, 0.035, 2.25), (x, -0.31, 1.18), WHITE, 0.015)
        cylinder("ACCENT handle", 0.012, 0.34, (x + 0.19, -0.345, 1.18), BRASS)
    box("ACCENT oak reveal", (2.2, 0.025, 0.08), (0, -0.335, 0.12), OAK, 0.01)


def desk():
    box("CANONICAL desk top", (1.4, 0.65, 0.07), (0, 0, 0.71), OAK, 0.04)
    for x in (-0.58, 0.58):
        box("ACCENT trestle", (0.06, 0.5, 0.68), (x, 0, 0.34), CHARCOAL, 0.018)
    box("CANONICAL drawer", (0.46, 0.52, 0.13), (0.4, 0, 0.61), OAK, 0.025)
    cylinder("ACCENT lamp stem", 0.016, 0.48, (-0.42, 0.05, 0.99), CHARCOAL)
    cylinder("ACCENT lamp shade", 0.14, 0.11, (-0.42, 0.05, 1.24), IVORY)


def kitchen_counter():
    box("CANONICAL cabinets", (3.0, 0.65, 0.84), (0, 0, 0.42), WHITE, 0.03)
    box("CANONICAL worktop", (3.0, 0.68, 0.055), (0, 0, 0.875), OAK, 0.025)
    for index, x in enumerate((-1.18, -0.58, 0, 0.58, 1.18)):
        box(f"CANONICAL front {index + 1}", (0.53, 0.025, 0.7), (x, -0.337, 0.43), WHITE, 0.012)
    box("ACCENT hob", (0.56, 0.42, 0.018), (0.78, -0.02, 0.915), CHARCOAL, 0.018)
    box("ACCENT sink", (0.56, 0.42, 0.02), (-0.62, -0.02, 0.915), BRASS, 0.018)


def shoe_cabinet():
    box("CANONICAL case", (1.2, 0.36, 1.02), (0, 0, 0.51), WHITE, 0.04)
    for index, z in enumerate((0.28, 0.56, 0.84)):
        box(f"CANONICAL front {index + 1}", (1.08, 0.025, 0.22), (0, -0.19, z), WHITE, 0.015)
        cylinder("ACCENT pull", 0.012, 0.32, (0, -0.215, z + 0.04), BRASS, rotation=(0, radians(90), 0))
    box("ACCENT oak top", (1.16, 0.38, 0.045), (0, 0, 1.04), OAK, 0.02)


def normalize_and_export(name, builder):
    clear_scene()
    builder()
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    world_points = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
    canonical = [obj for obj in meshes if obj.get("material_role") == "canonical"]
    canonical_points = [obj.matrix_world @ Vector(point) for obj in canonical for point in obj.bound_box]
    minimum = [min(point[i] for point in canonical_points) for i in range(3)]
    maximum = [max(point[i] for point in canonical_points) for i in range(3)]
    floor_z = min(point[2] for point in world_points)
    center = ((minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, floor_z)
    for obj in meshes:
        obj.location.x -= center[0]
        obj.location.y -= center[1]
        obj.location.z -= center[2]
        obj["asset_source"] = "original-blender-demo"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT / f"{name}.glb"),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )


ASSETS = {
    "sofa": sofa,
    "dining-table": dining_table,
    "tv-console": tv_console,
    "double-bed": lambda: bed(1.8, 2.0, 1.05),
    "single-bed": lambda: bed(1.2, 2.0, 0.9, True),
    "wardrobe": wardrobe,
    "desk": desk,
    "kitchen-counter": kitchen_counter,
    "shoe-cabinet": shoe_cabinet,
}

requested_assets = set(sys.argv[sys.argv.index("--") + 1:]) if "--" in sys.argv else set(ASSETS)
unknown_assets = requested_assets - ASSETS.keys()
if unknown_assets:
    raise SystemExit(f"Unknown asset(s): {', '.join(sorted(unknown_assets))}")

for asset_name, build in ASSETS.items():
    if asset_name not in requested_assets:
        continue
    normalize_and_export(asset_name, build)

print(f"Built {len(requested_assets)} original GLBs in {OUTPUT}")
