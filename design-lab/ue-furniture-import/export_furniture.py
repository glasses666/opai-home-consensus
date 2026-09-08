"""Acquired Fab source -> private staging GLBs, without resaving sources."""
import json
from pathlib import Path
import unreal

out = Path(unreal.Paths.project_saved_dir()) / "WebExports"
out.mkdir(parents=True, exist_ok=True)
names = ["SM_Modern_Sofa_1", "SM_Modern_Sofa_2", "SM_Modern_Armchair",
         "SM_Modern_Chair_1", "SM_Modern_Table", "SM_Coffee_Table",
         "SM_Modern_Bed_1", "SM_Modern_Bed_2", "SM_Commode",
         "SM_Modern_Cupboard", "SM_Modern_Cupboard_Sliding_Door",
         "SM_Bed_Table", "SM_Table_Lamp", "SM_Modern_Office_chair", "SM_Elegant_chair"]
options = unreal.GLTFExportOptions()
options.default_material_bake_size = unreal.GLTFMaterialBakeSize(x=512, y=512)
options.texture_image_format = unreal.GLTFTextureImageFormat.JPEG
options.texture_image_quality = 85
reports = []
for name in names:
    path = "/Game/FreeFurniturePack/Meshes/" + name
    asset = unreal.load_asset(path)
    if not asset:
        raise RuntimeError("Missing " + path)
    target = out / (name + ".glb")
    result = "Previously exported" if target.exists() else unreal.GLTFExporter.export_to_gltf(asset, str(target), options, set())
    if not target.exists():
        raise RuntimeError("No output for " + path)
    reports.append({"source": path, "file": target.name, "bytes": target.stat().st_size, "messages": str(result)})
    unreal.log("OPAI_EXPORTED " + json.dumps(reports[-1]))
    (out / "manifest.json").write_text(json.dumps(reports, indent=2))

# Inventory component transforms to assemble doors at their authored locations.
bp = unreal.load_asset("/Game/FreeFurniturePack/Blueprints/BP_Modern_Cupboard")
if bp:
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(bp.generated_class(), unreal.Vector())
    parts = []
    for c in actor.get_components_by_class(unreal.StaticMeshComponent):
        if c.static_mesh:
            t = c.get_world_transform()
            parts.append({"mesh": c.static_mesh.get_path_name(), "translation": list(t.translation.to_tuple()),
                          "rotation": [t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w],
                          "scale": list(t.scale3d.to_tuple())})
    (out / "cupboard-components.json").write_text(json.dumps(parts, indent=2))
    world = unreal.EditorLevelLibrary.get_editor_world()
    result = unreal.GLTFExporter.export_to_gltf(world, str(out / "wardrobe-assembled.glb"), options, {actor})
    unreal.log("OPAI_WARDROBE " + str(result))
    unreal.EditorLevelLibrary.destroy_actor(actor)
unreal.log("OPAI_BATCH_COMPLETE")
