"""Render-only 1080p upgrade of approved V07. No design changes."""
import bpy, json
from pathlib import Path
OUT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-white-v07.blend'))
scene = bpy.context.scene
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.cycles.samples = 64
scene.cycles.use_denoising = True
assert scene.frame_end == 96 and scene.render.fps == 24
scene.frame_set(42)
scene.render.filepath = str(OUT/'v08-1080p-still.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-1080p-v08.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'render-v08-manifest.json').write_text(json.dumps({
    'source':'oppein-mg-white-v07.blend',
    'changes_only':['1920x1080 at 100 percent','Cycles samples 24 to 64'],
    'frames':96,'fps':24,'samples':64,
    'preserved':'Geometry, materials, lighting, camera, all animation',
    'limit':'Original low-resolution traced logo contours remain unchanged',
    'scope':'Local render only; no production or remote changes'
}, indent=2))
