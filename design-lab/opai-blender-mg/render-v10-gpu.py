"""Full 1080p loop using verified local Metal device; leave global preferences unchanged."""
import bpy
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-smooth-v10.blend'))
p=bpy.context.preferences.addons['cycles'].preferences
p.compute_device_type='METAL';p.get_devices()
assert any(d.type=='METAL' for d in p.devices)
for d in p.devices:d.use=d.type=='METAL'
bpy.context.scene.cycles.device='GPU'
bpy.context.scene.render.filepath=str(OUT/'frames-v10/frame_')
bpy.ops.render.render(animation=True)
