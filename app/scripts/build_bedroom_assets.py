"""Build bedroom-specific studio assets with Blender.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/build_bedroom_assets.py

The exported pieces use the same metre, floor-at-zero, +Y-headboard convention as
the existing studio furniture.  The feature panel faces -Y so its art and relief
layers sit toward the room instead of inside the wall.
"""

from pathlib import Path
import json
import sys

import bpy
import numpy as np
from mathutils import Vector


HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parent / "public" / "assets" / "models" / "studio"

# Reuse the proven primitive/material helpers without executing the old export loop.
source = (HERE / "build_demo_assets.py").read_text()
kit = {"__file__": str(HERE / "build_demo_assets.py")}
exec(compile(source.split("requested_assets =")[0], str(HERE / "build_demo_assets.py"), "exec"), kit)


def textured_material(name, color, kind, roughness):
    """Create a small packed texture so the GLBs remain self-contained."""
    size = 256
    y, x = np.mgrid[0:size, 0:size]
    rng = np.random.default_rng(29)
    if kind == "walnut":
        grain = np.sin(x * 0.19 + np.sin(y * 0.035) * 2.1) * 0.055
        grain += np.sin(x * 0.73 + y * 0.012) * 0.018
        noise = grain + rng.normal(0, 0.006, (size, size))
    elif kind == "linen":
        weave = ((x % 5 < 2).astype(float) + (y % 5 < 2).astype(float) - 0.8) * 0.018
        noise = weave + rng.normal(0, 0.005, (size, size))
    else:
        noise = rng.normal(0, 0.009, (size, size))

    pixels = np.ones((size, size, 4), dtype=np.float32)
    pixels[:, :, :3] = np.clip(np.array(color)[None, None, :] * (1 + noise[:, :, None]), 0, 1)
    image = bpy.data.images.new(f"{name} surface", width=size, height=size)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()

    value = kit["material"](name, color, roughness)
    shader = next(node for node in value.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (1, 1, 1, 1)
    texture = value.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    value.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return value


WALNUT = textured_material("Bedroom walnut", (0.31, 0.16, 0.075), "walnut", 0.58)
IVORY_LINEN = textured_material("Bedroom ivory linen", (0.82, 0.78, 0.69), "linen", 0.92)
SAGE_LINEN = textured_material("Bedroom muted sage linen", (0.29, 0.36, 0.27), "linen", 0.91)
RUST_LINEN = textured_material("Bedroom muted rust linen", (0.49, 0.20, 0.105), "linen", 0.91)
WARM_PLASTER = textured_material("Bedroom warm plaster", (0.66, 0.61, 0.52), "mineral", 0.95)
INK = kit["material"]("Bedroom charcoal", (0.055, 0.05, 0.044), 0.62)
BRASS = kit["material"]("Bedroom aged brass", (0.43, 0.27, 0.10), 0.38, 0.48)
ART_CLAY = kit["material"]("Bedroom art clay", (0.56, 0.30, 0.17), 0.9)
ART_STONE = kit["material"]("Bedroom art stone", (0.73, 0.68, 0.59), 0.94)


def bedroom_bed():
    """1500 x 1900 mm warm contemporary platform bed, headboard at +Y."""
    box = kit["box"]
    cylinder = kit["cylinder"]

    # The canonical shell owns the exact 1.5 x 1.9 m footprint and 1.05 m height.
    box("CANONICAL walnut platform", (1.5, 1.9, 0.20), (0, 0, 0.16), WALNUT, 0.045)
    box("CANONICAL walnut headboard", (1.5, 0.10, 1.05), (0, 0.90, 0.525), WALNUT, 0.035)
    for index, x in enumerate((-0.56, -0.28, 0, 0.28, 0.56)):
        box(
            f"ACCENT walnut headboard panel {index + 1}",
            (0.245, 0.025, 0.84),
            (x, 0.8375, 0.56),
            WALNUT,
            0.012,
            role="accent",
        )
    box("ACCENT sage upholstered headboard band", (1.34, 0.025, 0.22), (0, 0.837, 0.31), SAGE_LINEN, 0.045, role="accent", smooth=True)

    # Low shadow feet make the platform feel lighter without changing its footprint.
    for x in (-0.58, 0.58):
        for y in (-0.70, 0.70):
            cylinder("ACCENT recessed foot", 0.035, 0.08, (x, y, 0.04), INK, role="accent")

    box("ACCENT pocket mattress", (1.42, 1.68, 0.23), (0, -0.05, 0.405), IVORY_LINEN, 0.085, role="accent", smooth=True)
    box("ACCENT relaxed ivory duvet", (1.40, 1.18, 0.10), (0, -0.22, 0.565), IVORY_LINEN, 0.085, role="accent", smooth=True)
    for side in (-1, 1):
        box(
            "ACCENT duvet side drape",
            (0.055, 1.04, 0.25),
            (side * 0.69, -0.22, 0.455),
            IVORY_LINEN,
            0.026,
            role="accent",
            smooth=True,
        )

    # Layered pillows introduce the rust/sage palette while keeping a quiet silhouette.
    for index, (x, angle) in enumerate(((-0.36, -4), (0.36, 4))):
        box(
            f"ACCENT ivory sleeping pillow {index + 1}",
            (0.62, 0.34, 0.13),
            (x, 0.55, 0.68),
            IVORY_LINEN,
            0.078,
            rotation=(0, 0, np.deg2rad(angle)),
            role="accent",
            smooth=True,
        )
    box("ACCENT sage throw pillow", (0.42, 0.25, 0.30), (-0.24, 0.42, 0.74), SAGE_LINEN, 0.09, rotation=(0, 0, np.deg2rad(-5)), role="accent", smooth=True)
    box("ACCENT rust lumbar pillow", (0.54, 0.22, 0.22), (0.19, 0.38, 0.73), RUST_LINEN, 0.09, rotation=(0, 0, np.deg2rad(5)), role="accent", smooth=True)
    box("ACCENT sage foot throw", (1.36, 0.34, 0.055), (0, -0.57, 0.64), SAGE_LINEN, 0.03, role="accent", smooth=True)
    box("ACCENT rust throw edge", (1.36, 0.075, 0.018), (0, -0.415, 0.674), RUST_LINEN, 0.008, role="accent", smooth=True)


def bedroom_feature_panel():
    """2200 x 40 x 2100 mm layered panel, with its decorated face toward -Y."""
    box = kit["box"]

    # Rear board plus proud edge rails establish an exact, centred 40 mm depth.
    box("CANONICAL warm plaster substrate", (2.2, 0.02, 2.1), (0, 0.01, 1.05), WARM_PLASTER, 0.009)
    for x in (-1.075, 1.075):
        box("CANONICAL walnut depth rail", (0.05, 0.02, 2.1), (x, -0.01, 1.05), WALNUT, 0.009)

    # The lower composition is intentionally asymmetric: broad walnut, inset sage,
    # and a thin brass datum give it richness without adding loose objects.
    box("ACCENT lower walnut field", (2.08, 0.012, 0.76), (0, -0.006, 0.40), WALNUT, 0.012, role="accent")
    box("ACCENT inset sage layer", (0.78, 0.008, 0.57), (0.55, -0.016, 0.39), SAGE_LINEN, 0.008, role="accent", smooth=True)
    box("ACCENT aged brass datum", (1.94, 0.006, 0.018), (0, -0.017, 0.79), BRASS, 0.003, role="accent")

    # Three battens sit behind the artwork; their -Y faces end at -0.010 m.
    for index, x in enumerate((-0.84, -0.68, -0.52)):
        box(f"ACCENT walnut upper batten {index + 1}", (0.075, 0.010, 1.15), (x, -0.005, 1.43), WALNUT, 0.005, role="accent")

    # A small, physical canvas: mount -> canvas -> raised artwork.  It is not
    # canonical geometry and the front sits 10 mm ahead of the battens, avoiding
    # co-planar surfaces and the prior z-fighting failure mode.
    art_x, art_z = 0.26, 1.43
    box("ACCENT artwork shadow mount", (0.96, 0.006, 0.70), (art_x, -0.006, art_z), INK, 0.006, role="accent")
    box("ACCENT artwork canvas", (0.88, 0.006, 0.62), (art_x, -0.014, art_z), ART_STONE, 0.006, role="accent")
    box("ACCENT artwork clay horizon", (0.74, 0.002, 0.15), (art_x + 0.02, -0.019, art_z - 0.13), ART_CLAY, 0.002, role="accent")
    box("ACCENT artwork sage plane", (0.28, 0.002, 0.34), (art_x - 0.19, -0.018, art_z + 0.07), SAGE_LINEN, 0.002, role="accent")
    box("ACCENT artwork walnut line", (0.055, 0.002, 0.48), (art_x + 0.20, -0.018, art_z + 0.01), WALNUT, 0.002, role="accent")

    # Slim surround reaches the -0.02 m front plane; it never overlaps the canvas.
    box("ACCENT artwork frame top", (0.98, 0.006, 0.035), (art_x, -0.017, art_z + 0.35), WALNUT, 0.006, role="accent")
    box("ACCENT artwork frame bottom", (0.98, 0.006, 0.035), (art_x, -0.017, art_z - 0.35), WALNUT, 0.006, role="accent")
    for x in (art_x - 0.4725, art_x + 0.4725):
        box("ACCENT artwork frame side", (0.035, 0.006, 0.735), (x, -0.017, art_z), WALNUT, 0.006, role="accent")


def bedroom_bedside():
    """Compact 460 x 420 mm walnut cabinet with a warm ceramic/linen lamp."""
    box, cylinder = kit["box"], kit["cylinder"]
    box("CANONICAL walnut cabinet", (0.46, 0.42, 0.38), (0, 0, 0.33), WALNUT, 0.025)
    box("ACCENT pale stone top", (0.46, 0.42, 0.025), (0, 0, 0.5325), ART_STONE, 0.012, role="accent")
    for x in (-0.175, 0.175):
        for y in (-0.15, 0.15):
            cylinder("ACCENT short walnut foot", 0.024, 0.14, (x, y, 0.07), WALNUT, role="accent")
    for z in (0.245, 0.415):
        box("ACCENT sage drawer", (0.40, 0.012, 0.15), (0, -0.197, z), SAGE_LINEN, 0.012, role="accent")
        box("ACCENT brass drawer pull", (0.11, 0.012, 0.008), (0, -0.204, z + 0.035), BRASS, 0.004, role="accent")
    cylinder("ACCENT ceramic lamp foot", 0.07, 0.028, (0, 0.04, 0.56), ART_STONE, role="accent")
    kit["sphere"]("ACCENT ceramic lamp body", (0.065, 0.065, 0.105), (0, 0.04, 0.655), ART_STONE)
    cylinder("ACCENT brass lamp neck", 0.015, 0.10, (0, 0.04, 0.77), BRASS, role="accent")
    glow = kit["material"]("Bedside warm linen shade", (0.94, 0.82, 0.59), 0.92)
    shader = next(node for node in glow.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Emission Color"].default_value = (1, 0.69, 0.32, 1)
    shader.inputs["Emission Strength"].default_value = 0.28
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.145, radius2=0.105, depth=0.21, location=(0, 0.04, 0.895))
    shade = bpy.context.object
    shade.name = "ACCENT warm linen lampshade"
    shade.data.materials.append(glow)
    shade["material_role"] = "accent"
    for face in shade.data.polygons:
        face.use_smooth = True
    box("ACCENT bedside book", (0.17, 0.115, 0.02), (0.115, -0.10, 0.555), RUST_LINEN, 0.005, role="accent")


def bedroom_surround():
    """Full-width 3380 mm headwall: quiet plaster above continuous joinery."""
    bedroom_feature_panel()
    for obj in list(bpy.context.scene.objects):
        if "artwork" in obj.name:
            obj.location.x -= 1.22  # Artwork aligned with the unchanged bed, not the wall centre.
        else:
            bpy.data.objects.remove(obj, do_unlink=True)
    box = kit["box"]
    plaster = textured_material("Bedroom warm ivory plaster", (0.79, 0.75, 0.68), "mineral", 0.94)
    box("CANONICAL continuous plaster", (3.38, 0.02, 2.70), (0, 0.01, 1.35), plaster, 0.006)
    box("ACCENT continuous walnut wainscot", (3.38, 0.016, 1.02), (0, -0.008, 0.51), WALNUT, 0.004, role="accent")
    for x in (-1.13, -0.565, 0, 0.565, 1.13):
        box("ACCENT fine joinery stile", (0.014, 0.004, 0.97), (x, -0.018, 0.51), WALNUT, 0.002, role="accent")
    box("ACCENT continuous walnut cap", (3.38, 0.04, 0.022), (0, 0, 1.031), WALNUT, 0.004, role="accent")
    # A narrow flute field terminates the wall at the window; it is not another frame.
    for index in range(7):
        box("ACCENT window end flute", (0.022, 0.012, 1.58), (1.38 + index * 0.04, -0.006, 1.87), WALNUT, 0.004, role="accent")


def bounds(objects):
    points = [obj.matrix_world @ Vector(point) for obj in objects for point in obj.bound_box]
    minimum = [min(point[index] for point in points) for index in range(3)]
    maximum = [max(point[index] for point in points) for index in range(3)]
    return minimum, maximum


def export_asset(name, builder, expected_bounds):
    kit["clear_scene"]()
    builder()
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    canonical = [obj for obj in meshes if obj.get("material_role") == "canonical"]
    minimum, maximum = bounds(canonical)
    all_minimum, _ = bounds(meshes)
    center = (
        (minimum[0] + maximum[0]) / 2,
        (minimum[1] + maximum[1]) / 2,
        all_minimum[2],
    )
    for obj in meshes:
        obj.location.x -= center[0]
        obj.location.y -= center[1]
        obj.location.z -= center[2]
        obj["asset_source"] = "original-bedroom-blender"

    final_minimum, final_maximum = bounds(meshes)
    dimensions = [final_maximum[index] - final_minimum[index] for index in range(3)]
    for actual, expected, axis in zip(dimensions, expected_bounds, "XYZ"):
        if abs(actual - expected) > 1e-5:
            raise RuntimeError(f"{name} {axis} bound {actual:.6f} != {expected:.6f}")

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
    report = {
        "asset": name,
        "meshes": len(meshes),
        "minimum_m": [round(value, 4) for value in final_minimum],
        "maximum_m": [round(value, 4) for value in final_maximum],
        "dimensions_m": [round(value, 4) for value in dimensions],
    }
    print(json.dumps(report, ensure_ascii=False), flush=True)


builders = {
    "bedroom-bed": (bedroom_bed, (1.5, 1.9, 1.05)),
    "bedroom-feature": (bedroom_feature_panel, (2.2, 0.04, 2.1)),
    "bedroom-bedside": (bedroom_bedside, (0.46, 0.42, 1.0)),
    "bedroom-surround": (bedroom_surround, (3.38, 0.04, 2.7)),
}
requested = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(builders)
for name in requested:
    export_asset(name, *builders[name])
print(f"Built {len(requested)} bedroom GLBs in {OUTPUT}", flush=True)
