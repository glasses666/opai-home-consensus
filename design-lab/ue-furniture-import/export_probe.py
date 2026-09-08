"""Run with Unreal's Python commandlet; never modifies source assets."""
import json
from pathlib import Path
import unreal

out = Path(unreal.Paths.project_saved_dir()) / "WebExports"
out.mkdir(parents=True, exist_ok=True)
asset_path = "/Game/FreeFurniturePack/Meshes/SM_Coffee_Table"
asset = unreal.load_asset(asset_path)
if not asset:
    raise RuntimeError("Missing acquired asset: " + asset_path)
options = unreal.GLTFExportOptions()
options.set_editor_property("default_material_bake_size", unreal.GLTFMaterialBakeSize(x=512, y=512))
options.set_editor_property("texture_image_format", unreal.GLTFTextureImageFormat.JPEG)
options.set_editor_property("texture_image_quality", 85)
target = out / "coffee-table.glb"
result = unreal.GLTFExporter.export_to_gltf(asset, str(target), options, set())
report = {"source": asset_path, "result": str(result), "bytes": target.stat().st_size if target.exists() else 0}
(out / "probe.json").write_text(json.dumps(report, indent=2))
unreal.log("OPAI_EXPORT_PROBE " + json.dumps(report))
if not target.exists():
    raise RuntimeError("Export did not produce GLB")
